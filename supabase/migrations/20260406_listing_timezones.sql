-- Listing timezone support + reservation validation in listing local time

-- =========================
-- LISTINGS TIMEZONE COLUMN
-- =========================
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS timezone TEXT;

UPDATE public.listings
SET timezone = 'UTC'
WHERE timezone IS NULL;

ALTER TABLE public.listings
  ALTER COLUMN timezone SET DEFAULT 'UTC';

ALTER TABLE public.listings
  ALTER COLUMN timezone SET NOT NULL;

-- Validate IANA timezone names
CREATE OR REPLACE FUNCTION public.assert_valid_timezone(p_timezone TEXT)
RETURNS TEXT AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  v_timezone := NULLIF(BTRIM(p_timezone), '');

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Timezone is required';
  END IF;

  PERFORM 1
  FROM pg_timezone_names t
  WHERE t.name = v_timezone
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid timezone: %', v_timezone;
  END IF;

  RETURN v_timezone;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = '';

-- =========================
-- LISTINGS CRUD (timezone-aware)
-- =========================
DROP FUNCTION IF EXISTS public.create_listing(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TEXT,
  TEXT,
  public.listing_category,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  TEXT,
  TEXT,
  DOUBLE PRECISION
);

CREATE OR REPLACE FUNCTION public.create_listing(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_address TEXT,
  p_title TEXT,
  p_subtitle TEXT,
  p_category public.listing_category,
  p_price DOUBLE PRECISION,
  p_images TEXT[],
  p_description TEXT,
  p_equipment_desc TEXT,
  p_conveniences_desc TEXT,
  p_area_m2 DOUBLE PRECISION,
  p_timezone TEXT DEFAULT 'UTC'
) RETURNS jsonb AS $$
DECLARE
  result public.listings%ROWTYPE;
  v_timezone TEXT;
BEGIN
  IF p_area_m2 <= 0 THEN
    RAISE EXCEPTION 'Area must be greater than 0 m2';
  END IF;

  v_timezone := public.assert_valid_timezone(p_timezone);

  INSERT INTO public.listings(
    lat, lng, address, title, subtitle, category, price, images, description, equipment_desc, conveniences_desc, area_m2, owner_id, timezone
  ) VALUES (
    p_lat, p_lng, p_address, p_title, p_subtitle, p_category, p_price, p_images, p_description, p_equipment_desc, p_conveniences_desc, p_area_m2, auth.uid(), v_timezone
  ) RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP FUNCTION IF EXISTS public.update_listing(
  UUID,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TEXT,
  TEXT,
  public.listing_category,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  TEXT,
  TEXT,
  DOUBLE PRECISION
);

CREATE OR REPLACE FUNCTION public.update_listing(
  p_id UUID,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_subtitle TEXT DEFAULT NULL,
  p_category public.listing_category DEFAULT NULL,
  p_price DOUBLE PRECISION DEFAULT NULL,
  p_images TEXT[] DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_equipment_desc TEXT DEFAULT NULL,
  p_conveniences_desc TEXT DEFAULT NULL,
  p_area_m2 DOUBLE PRECISION DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  result public.listings%ROWTYPE;
  v_timezone TEXT;
BEGIN
  IF p_area_m2 IS NOT NULL AND p_area_m2 <= 0 THEN
    RAISE EXCEPTION 'Area must be greater than 0 m2';
  END IF;

  v_timezone := CASE
    WHEN p_timezone IS NULL THEN NULL
    ELSE public.assert_valid_timezone(p_timezone)
  END;

  UPDATE public.listings
  SET
    lat = COALESCE(p_lat, lat),
    lng = COALESCE(p_lng, lng),
    address = COALESCE(p_address, address),
    title = COALESCE(p_title, title),
    subtitle = COALESCE(p_subtitle, subtitle),
    category = COALESCE(p_category, category),
    price = COALESCE(p_price, price),
    images = COALESCE(p_images, images),
    description = COALESCE(p_description, description),
    equipment_desc = COALESCE(p_equipment_desc, equipment_desc),
    conveniences_desc = COALESCE(p_conveniences_desc, conveniences_desc),
    area_m2 = COALESCE(p_area_m2, area_m2),
    timezone = COALESCE(v_timezone, timezone)
  WHERE id = p_id
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- =========================
-- RESERVATION VALIDATION IN LISTING LOCAL TIME
-- =========================
CREATE OR REPLACE FUNCTION public.validate_and_price_reservation_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_total DOUBLE PRECISION := 0;
  v_hour_ts TIMESTAMPTZ;
  v_weekday SMALLINT;
  v_hour SMALLINT;
  v_slot_price DOUBLE PRECISION;
  v_listing_timezone TEXT;
BEGIN
  -- Full-hour alignment
  IF date_part('minute', NEW.start_at) <> 0 OR date_part('second', NEW.start_at) <> 0
     OR date_part('minute', NEW.end_at) <> 0 OR date_part('second', NEW.end_at) <> 0 THEN
    RAISE EXCEPTION 'Reservations must start/end on full hour boundaries';
  END IF;

  -- At least 1 hour
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Invalid reservation range';
  END IF;

  SELECT COALESCE(l.timezone, 'UTC')
  INTO v_listing_timezone
  FROM public.listings l
  WHERE l.id = NEW.listing_id;

  IF v_listing_timezone IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate each hour slot in [start_at, end_at) in listing local time
  v_hour_ts := NEW.start_at;
  WHILE v_hour_ts < NEW.end_at LOOP
    v_weekday := EXTRACT(DOW FROM (v_hour_ts AT TIME ZONE v_listing_timezone))::SMALLINT;
    v_hour := EXTRACT(HOUR FROM (v_hour_ts AT TIME ZONE v_listing_timezone))::SMALLINT;

    SELECT s.price INTO v_slot_price
    FROM public.listing_weekly_slots s
    WHERE s.listing_id = NEW.listing_id
      AND s.weekday = v_weekday
      AND s.hour = v_hour;

    IF v_slot_price IS NULL THEN
      RAISE EXCEPTION 'Hour % on weekday % is closed for this listing', v_hour, v_weekday;
    END IF;

    v_total := v_total + v_slot_price;
    v_hour_ts := v_hour_ts + INTERVAL '1 hour';
  END LOOP;

  -- Serialize booking checks per listing to reduce race conditions
  PERFORM pg_advisory_xact_lock(hashtext(NEW.listing_id::text));

  IF EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.listing_id = NEW.listing_id
      AND r.status IN ('PENDING', 'CONFIRMED')
      AND (NEW.id IS NULL OR r.id <> NEW.id)
      AND tstzrange(r.start_at, r.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Reservation overlaps an existing active reservation';
  END IF;

  NEW.total_price := v_total;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- =========================
-- SLOT READ RPCS (booking overlap in listing local time)
-- =========================
CREATE OR REPLACE FUNCTION public.list_listing_week_slots(
  p_listing_id UUID,
  p_week DATE
) RETURNS SETOF jsonb AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  SELECT COALESCE(l.timezone, 'UTC')
  INTO v_timezone
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  RETURN QUERY
  WITH day_grid AS (
    SELECT generate_series(
      date_trunc('week', p_week)::DATE,
      (date_trunc('week', p_week) + INTERVAL '6 days')::DATE,
      INTERVAL '1 day'
    )::DATE AS slot_date
  ),
  hour_grid AS (
    SELECT generate_series(0, 23) AS hour
  ),
  base AS (
    SELECT
      d.slot_date,
      h.hour,
      EXTRACT(DOW FROM d.slot_date)::SMALLINT AS weekday,
      s.price
    FROM day_grid d
    CROSS JOIN hour_grid h
    LEFT JOIN public.listing_weekly_slots s
      ON s.listing_id = p_listing_id
     AND s.weekday = EXTRACT(DOW FROM d.slot_date)::SMALLINT
     AND s.hour = h.hour
  ),
  slots AS (
    SELECT
      b.slot_date,
      b.hour,
      b.price,
      make_timestamptz(
        EXTRACT(YEAR FROM b.slot_date)::INT,
        EXTRACT(MONTH FROM b.slot_date)::INT,
        EXTRACT(DAY FROM b.slot_date)::INT,
        b.hour,
        0,
        0,
        v_timezone
      ) AS slot_start_at
    FROM base b
  )
  SELECT jsonb_build_object(
    'date', s.slot_date,
    'hour', s.hour,
    'price', s.price,
    'is_booked',
      EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.listing_id = p_listing_id
          AND r.status IN ('PENDING', 'CONFIRMED')
          AND tstzrange(r.start_at, r.end_at, '[)') &&
              tstzrange(
                s.slot_start_at,
                s.slot_start_at + INTERVAL '1 hour',
                '[)'
              )
      )
  )
  FROM slots s
  ORDER BY s.slot_date, s.hour;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE OR REPLACE FUNCTION public.list_listing_month_slots(
  p_listing_id UUID,
  p_month DATE
) RETURNS SETOF jsonb AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  SELECT COALESCE(l.timezone, 'UTC')
  INTO v_timezone
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  RETURN QUERY
  WITH day_grid AS (
    SELECT generate_series(
      date_trunc('month', p_month)::DATE,
      (date_trunc('month', p_month) + INTERVAL '1 month - 1 day')::DATE,
      INTERVAL '1 day'
    )::DATE AS slot_date
  ),
  hour_grid AS (
    SELECT generate_series(0, 23) AS hour
  ),
  base AS (
    SELECT
      d.slot_date,
      h.hour,
      EXTRACT(DOW FROM d.slot_date)::SMALLINT AS weekday,
      s.price
    FROM day_grid d
    CROSS JOIN hour_grid h
    LEFT JOIN public.listing_weekly_slots s
      ON s.listing_id = p_listing_id
     AND s.weekday = EXTRACT(DOW FROM d.slot_date)::SMALLINT
     AND s.hour = h.hour
  ),
  slots AS (
    SELECT
      b.slot_date,
      b.hour,
      b.price,
      make_timestamptz(
        EXTRACT(YEAR FROM b.slot_date)::INT,
        EXTRACT(MONTH FROM b.slot_date)::INT,
        EXTRACT(DAY FROM b.slot_date)::INT,
        b.hour,
        0,
        0,
        v_timezone
      ) AS slot_start_at
    FROM base b
  )
  SELECT jsonb_build_object(
    'date', s.slot_date,
    'hour', s.hour,
    'price', s.price,
    'is_booked',
      EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.listing_id = p_listing_id
          AND r.status IN ('PENDING', 'CONFIRMED')
          AND tstzrange(r.start_at, r.end_at, '[)') &&
              tstzrange(
                s.slot_start_at,
                s.slot_start_at + INTERVAL '1 hour',
                '[)'
              )
      )
  )
  FROM slots s
  ORDER BY s.slot_date, s.hour;
END;
$$ LANGUAGE plpgsql SET search_path = '';
