-- Listing availability + hourly pricing + reservations
-- Works with existing public.listings(id, owner_id, price) and public.user(id)

-- =========================
-- ENUMS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'reservation_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.reservation_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
  END IF;
END$$;

-- =========================
-- TABLES
-- =========================

-- Weekly slot template per listing
-- weekday: 0=Sunday ... 6=Saturday
-- hour: 0..23
-- if a slot row is absent, that hour is closed
CREATE TABLE IF NOT EXISTS public.listing_weekly_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  price DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT listing_weekly_slots_unique UNIQUE (listing_id, weekday, hour),
  CONSTRAINT listing_weekly_slots_price_positive CHECK (price > 0)
);

-- Ensure existing installations match current non-null-price model
ALTER TABLE public.listing_weekly_slots
  ALTER COLUMN price SET NOT NULL;

ALTER TABLE public.listing_weekly_slots
  DROP CONSTRAINT IF EXISTS listing_weekly_slots_price_positive;

ALTER TABLE public.listing_weekly_slots
  ADD CONSTRAINT listing_weekly_slots_price_positive CHECK (price > 0);

-- Reservations/bookings
-- Range is [start_at, end_at), so end hour is not included
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  renter_id UUID NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'PENDING',
  total_price DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  guests INTEGER NOT NULL DEFAULT 1 CHECK (guests >= 1),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT reservations_time_valid CHECK (start_at < end_at)
);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_listing_weekly_slots_listing_id
  ON public.listing_weekly_slots(listing_id);

CREATE INDEX IF NOT EXISTS idx_reservations_listing_id
  ON public.reservations(listing_id);

CREATE INDEX IF NOT EXISTS idx_reservations_renter_id
  ON public.reservations(renter_id);

CREATE INDEX IF NOT EXISTS idx_reservations_time
  ON public.reservations(start_at, end_at);

-- =========================
-- UPDATED_AT TRIGGERS
-- =========================
-- Reuse your existing public.update_updated_at_column()

DROP TRIGGER IF EXISTS set_updated_at_listing_weekly_slots ON public.listing_weekly_slots;
CREATE TRIGGER set_updated_at_listing_weekly_slots
BEFORE UPDATE ON public.listing_weekly_slots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_reservations ON public.reservations;
CREATE TRIGGER set_updated_at_reservations
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- VALIDATION FUNCTION
-- =========================
-- Ensures reservation is:
-- 1) aligned to full hours
-- 2) slot is open (price is not null)
-- 3) priced from listing_weekly_slots
-- 4) no overlap with other active reservations for same listing
CREATE OR REPLACE FUNCTION public.validate_and_price_reservation_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_total DOUBLE PRECISION := 0;
  v_hour_ts TIMESTAMPTZ;
  v_weekday SMALLINT;
  v_hour SMALLINT;
  v_slot_price DOUBLE PRECISION;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = NEW.listing_id
  ) THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate each hour slot in [start_at, end_at)
  v_hour_ts := NEW.start_at;
  WHILE v_hour_ts < NEW.end_at LOOP
    v_weekday := EXTRACT(DOW FROM v_hour_ts)::SMALLINT;
    v_hour := EXTRACT(HOUR FROM v_hour_ts)::SMALLINT;

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

DROP TRIGGER IF EXISTS validate_and_price_reservation ON public.reservations;
CREATE TRIGGER validate_and_price_reservation
BEFORE INSERT OR UPDATE OF listing_id, start_at, end_at, status
ON public.reservations
FOR EACH ROW
WHEN (NEW.status IN ('PENDING', 'CONFIRMED'))
EXECUTE FUNCTION public.validate_and_price_reservation_fn();

-- Enforce reservation status transitions:
-- PENDING   -> CONFIRMED | CANCELLED
-- CONFIRMED -> CANCELLED
-- CANCELLED -> CANCELLED only (terminal)
CREATE OR REPLACE FUNCTION public.enforce_reservation_status_transition_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cancelled reservation cannot change status';
  END IF;

  IF OLD.status = 'CONFIRMED' AND NEW.status = 'PENDING' THEN
    RAISE EXCEPTION 'Confirmed reservation cannot be changed back to pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS enforce_reservation_status_transition ON public.reservations;
CREATE TRIGGER enforce_reservation_status_transition
BEFORE UPDATE OF status
ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reservation_status_transition_fn();

-- =========================
-- RPC FUNCTIONS
-- =========================

-- Upsert one weekly slot
CREATE OR REPLACE FUNCTION public.upsert_listing_weekly_slot(
  p_listing_id UUID,
  p_weekday SMALLINT,
  p_hour SMALLINT,
  p_price DOUBLE PRECISION
) RETURNS jsonb AS $$
DECLARE
  result public.listing_weekly_slots%ROWTYPE;
BEGIN
  INSERT INTO public.listing_weekly_slots (listing_id, weekday, hour, price)
  VALUES (p_listing_id, p_weekday, p_hour, p_price)
  ON CONFLICT (listing_id, weekday, hour)
  DO UPDATE SET
    price = EXCLUDED.price
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Bulk set weekly slots for all 168 hours.
-- p_slots is a JSON array of working-hour rows only:
-- [
--   {"weekday": 1, "hour": 9, "price": 30},
--   {"weekday": 1, "hour": 10, "price": 35}
-- ]
-- Any absent (weekday,hour) is treated as closed.
CREATE OR REPLACE FUNCTION public.set_listing_weekly_slots(
  p_listing_id UUID,
  p_slots jsonb
) RETURNS jsonb AS $$
DECLARE
  v_count INTEGER;
  v_is_owner BOOLEAN;
  v_changed_keys jsonb := '[]'::jsonb;
  v_changed_hours jsonb := '[]'::jsonb;
BEGIN
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'p_slots must be a JSON array';
  END IF;

  v_count := COALESCE(jsonb_array_length(p_slots), 0);

  IF v_count > 168 THEN
    RAISE EXCEPTION 'p_slots cannot contain more than 168 rows, got %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_slots) AS s(weekday smallint, hour smallint, price double precision)
    WHERE s.weekday IS NULL
       OR s.hour IS NULL
       OR s.price IS NULL
       OR s.weekday < 0 OR s.weekday > 6
       OR s.hour < 0 OR s.hour > 23
       OR s.price <= 0
  ) THEN
    RAISE EXCEPTION 'Each slot must have weekday 0..6, hour 0..23, and price > 0';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_slots) AS s(weekday smallint, hour smallint, price double precision)
    GROUP BY s.weekday, s.hour
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate s (weekday, hour) found in p_slots';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = p_listing_id
      AND l.owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only the listing owner can update weekly slots';
  END IF;

  -- Compute which weekly hours changed compared to existing template
  WITH new_slots AS (
    SELECT
      s.weekday,
      s.hour,
      s.price
    FROM jsonb_to_recordset(p_slots) AS s(weekday smallint, hour smallint, price double precision)
  ),
  changed AS (
    SELECT
      COALESCE(o.weekday, n.weekday) AS weekday,
      COALESCE(o.hour, n.hour) AS hour
    FROM public.listing_weekly_slots o
    FULL JOIN new_slots n
      ON o.listing_id = p_listing_id
     AND o.weekday = n.weekday
     AND o.hour = n.hour
    WHERE (o.listing_id = p_listing_id AND o.price IS DISTINCT FROM n.price)
       OR (o.listing_id IS NULL AND n.weekday IS NOT NULL)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'weekday', c.weekday,
        'hour', c.hour
      )
      ORDER BY c.weekday, c.hour
    ),
    '[]'::jsonb
  )
  INTO v_changed_keys
  FROM changed c;

  -- Replace existing slots atomically
  DELETE FROM public.listing_weekly_slots
  WHERE listing_id = p_listing_id;

  -- Insert provided working slots only
  INSERT INTO public.listing_weekly_slots (listing_id, weekday, hour, price)
  SELECT
    p_listing_id,
    s.weekday,
    s.hour,
    s.price
  FROM jsonb_to_recordset(p_slots) AS s(weekday smallint, hour smallint, price double precision);

  -- Return changed rows in original listing_weekly_slots row shape
  SELECT COALESCE(
    jsonb_agg(to_jsonb(s) ORDER BY s.weekday, s.hour),
    '[]'::jsonb
  )
  INTO v_changed_hours
  FROM public.listing_weekly_slots s
  JOIN jsonb_to_recordset(v_changed_keys) AS k(weekday SMALLINT, hour SMALLINT)
    ON s.listing_id = p_listing_id
   AND s.weekday = k.weekday
   AND s.hour = k.hour;

  RETURN jsonb_build_object(
    'listing_id', p_listing_id,
    'weekly_slots_saved', v_count,
    'closed_slots', 168 - v_count,
    'changed_count', jsonb_array_length(v_changed_keys),
    'changed_hours', v_changed_hours
  );
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Week view used by frontend table:
-- returns one row per hour for every day in target week
-- week starts on Monday via date_trunc('week', ...)
-- price is NULL when slot is outside working hours
CREATE OR REPLACE FUNCTION public.list_listing_week_slots(
  p_listing_id UUID,
  p_week DATE
) RETURNS SETOF jsonb AS $$
BEGIN
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
    )
  SELECT jsonb_build_object(
    'date', b.slot_date,
    'hour', b.hour,
    'price', b.price,
    'is_booked',
      EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.listing_id = p_listing_id
          AND r.status IN ('PENDING', 'CONFIRMED')
          AND tstzrange(r.start_at, r.end_at, '[)') &&
              tstzrange(
                (b.slot_date::timestamp + make_interval(hours => b.hour))::timestamptz,
                (b.slot_date::timestamp + make_interval(hours => b.hour + 1))::timestamptz,
                '[)'
              )
      )
  )
  FROM base b
  ORDER BY b.slot_date, b.hour;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Month view used by frontend calendar/table:
-- returns one row per hour for every day in target month
-- (shape mirrors list_listing_week_slots)
-- price is NULL when slot is outside working hours
CREATE OR REPLACE FUNCTION public.list_listing_month_slots(
  p_listing_id UUID,
  p_month DATE
) RETURNS SETOF jsonb AS $$
BEGIN
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
    )
  SELECT jsonb_build_object(
    'date', b.slot_date,
    'hour', b.hour,
    'price', b.price,
    'is_booked',
      EXISTS (
        SELECT 1
        FROM public.reservations r
        WHERE r.listing_id = p_listing_id
          AND r.status IN ('PENDING', 'CONFIRMED')
          AND tstzrange(r.start_at, r.end_at, '[)') &&
              tstzrange(
                (b.slot_date::timestamp + make_interval(hours => b.hour))::timestamptz,
                (b.slot_date::timestamp + make_interval(hours => b.hour + 1))::timestamptz,
                '[)'
              )
      )
  )
  FROM base b
  ORDER BY b.slot_date, b.hour;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Get one reservation by id (visibility controlled by reservations RLS)
CREATE OR REPLACE FUNCTION public.get_reservation(
  p_reservation_id UUID
) RETURNS jsonb AS $$
DECLARE
  v_uid UUID;
  v_reservation public.reservations%ROWTYPE;
  v_listing public.listings%ROWTYPE;
  v_owner public.user%ROWTYPE;
  v_can_view_sensitive BOOLEAN := FALSE;
  v_listing_public jsonb := NULL;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT r.*
  INTO v_reservation
  FROM public.reservations r
  WHERE r.id = p_reservation_id;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  SELECT l.*
  INTO v_listing
  FROM public.listings l
  WHERE l.id = v_reservation.listing_id;

  IF v_listing.id IS NOT NULL THEN
    SELECT u.*
    INTO v_owner
    FROM public.user u
    WHERE u.id = v_listing.owner_id;

    v_can_view_sensitive :=
      (v_uid = v_listing.owner_id)
      OR (v_uid = v_reservation.renter_id AND v_reservation.status = 'CONFIRMED');

    -- Public-safe listing shape (matches list_listings obfuscation)
    v_listing_public := to_jsonb(v_listing)
      || jsonb_build_object(
        'lat', v_listing.lat + (((900 + random() * 600) / 111320.0) * cos(random() * 2 * pi())),
        'lng', v_listing.lng + (((900 + random() * 600) / (111320.0 * GREATEST(abs(cos(radians(v_listing.lat))), 1e-6))) * sin(random() * 2 * pi())),
        'address', CASE
          WHEN strpos(v_listing.address, ',') > 0 THEN ltrim(substr(v_listing.address, strpos(v_listing.address, ',') + 1))
          ELSE v_listing.address
        END
      );
  END IF;

  RETURN to_jsonb(v_reservation)
    || jsonb_build_object(
      'listing', CASE
        WHEN v_listing.id IS NULL THEN NULL::jsonb
        WHEN v_can_view_sensitive THEN to_jsonb(v_listing)
        ELSE v_listing_public
      END,
      'owner', CASE
        WHEN v_owner.id IS NULL THEN NULL::jsonb
        WHEN v_can_view_sensitive THEN to_jsonb(v_owner)
        ELSE NULL::jsonb
      END
    );
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Create reservation (price auto-calculated by trigger)
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_listing_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_guests INTEGER DEFAULT 1
) RETURNS jsonb AS $$
DECLARE
  result public.reservations%ROWTYPE;
BEGIN
  INSERT INTO public.reservations (listing_id, renter_id, start_at, end_at, guests, status)
  VALUES (p_listing_id, auth.uid(), p_start_at, p_end_at, p_guests, 'PENDING')
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- List all upcoming or currently ongoing reservations for current authenticated renter
CREATE OR REPLACE FUNCTION public.list_user_active_reservations(
  p_renter_id UUID DEFAULT NULL
)
RETURNS SETOF jsonb AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := COALESCE(p_renter_id, auth.uid());

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(r)
  FROM public.reservations r
  WHERE r.renter_id = v_uid
    AND r.status IN ('PENDING', 'CONFIRMED')
    AND r.end_at > NOW()
  ORDER BY r.start_at ASC;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- List all reservations for a host in a specific month (current year)
-- p_month: 1..12
CREATE OR REPLACE FUNCTION public.list_host_monthly_reservations(
  p_host_id UUID DEFAULT NULL,
  p_month SMALLINT DEFAULT EXTRACT(MONTH FROM NOW())::SMALLINT
)
RETURNS SETOF jsonb AS $$
DECLARE
  v_host_id UUID;
  v_year INTEGER;
BEGIN
  v_host_id := COALESCE(p_host_id, auth.uid());

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'p_month must be between 1 and 12';
  END IF;

  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  RETURN QUERY
  SELECT to_jsonb(r)
  FROM public.reservations r
  JOIN public.listings l
    ON l.id = r.listing_id
  WHERE l.owner_id = v_host_id
    AND EXTRACT(YEAR FROM r.start_at)::INTEGER = v_year
    AND EXTRACT(MONTH FROM r.start_at)::SMALLINT = p_month
  ORDER BY r.start_at ASC;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Confirm reservation (host/owner only)
CREATE OR REPLACE FUNCTION public.confirm_reservation(
  p_reservation_id UUID
) RETURNS jsonb AS $$
DECLARE
  v_uid UUID;
  v_owner_id UUID;
  v_end_at TIMESTAMPTZ;
  result public.reservations%ROWTYPE;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT l.owner_id, r.end_at
  INTO v_owner_id, v_end_at
  FROM public.reservations r
  JOIN public.listings l ON l.id = r.listing_id
  WHERE r.id = p_reservation_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_owner_id <> v_uid THEN
    RAISE EXCEPTION 'Only listing owner can confirm this reservation';
  END IF;

  IF v_end_at <= NOW() THEN
    RAISE EXCEPTION 'Past reservations cannot be confirmed';
  END IF;

  UPDATE public.reservations r
  SET status = 'CONFIRMED'
  WHERE r.id = p_reservation_id
    AND r.status <> 'CANCELLED'
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Reservation could not be confirmed';
  END IF;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Cancel reservation (renter or listing owner)
CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id UUID
) RETURNS jsonb AS $$
DECLARE
  v_uid UUID;
  v_renter_id UUID;
  v_owner_id UUID;
  v_end_at TIMESTAMPTZ;
  result public.reservations%ROWTYPE;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT r.renter_id, l.owner_id, r.end_at
  INTO v_renter_id, v_owner_id, v_end_at
  FROM public.reservations r
  JOIN public.listings l ON l.id = r.listing_id
  WHERE r.id = p_reservation_id;

  IF v_renter_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_uid <> v_renter_id AND v_uid <> v_owner_id THEN
    RAISE EXCEPTION 'Only renter or listing owner can cancel this reservation';
  END IF;

  IF v_end_at <= NOW() THEN
    RAISE EXCEPTION 'Past reservations cannot be cancelled';
  END IF;

  UPDATE public.reservations r
  SET status = 'CANCELLED'
  WHERE r.id = p_reservation_id
    AND r.status <> 'CANCELLED'
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Reservation is already cancelled';
  END IF;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- =========================
-- RLS
-- =========================
ALTER TABLE public.listing_weekly_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Public can read slots
DROP POLICY IF EXISTS listing_weekly_slots_public_select ON public.listing_weekly_slots;
CREATE POLICY listing_weekly_slots_public_select
  ON public.listing_weekly_slots FOR SELECT USING (true);

-- Only listing owner can manage slots
DROP POLICY IF EXISTS listing_weekly_slots_owner_manage ON public.listing_weekly_slots;
CREATE POLICY listing_weekly_slots_owner_manage
  ON public.listing_weekly_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_weekly_slots.listing_id
        AND l.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_weekly_slots.listing_id
        AND l.owner_id = auth.uid()
    )
  );

-- Reservations visibility:
-- renter sees own, owner sees reservations on own listings
DROP POLICY IF EXISTS reservations_view_own_or_owner ON public.reservations;
CREATE POLICY reservations_view_own_or_owner
  ON public.reservations
  FOR SELECT
  USING (
    renter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = reservations.listing_id
        AND l.owner_id = auth.uid()
    )
  );

-- Auth users can create reservation for themselves
DROP POLICY IF EXISTS reservations_insert_authenticated ON public.reservations;
CREATE POLICY reservations_insert_authenticated
  ON public.reservations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND renter_id = auth.uid()
  );

-- Renter can cancel own reservation
DROP POLICY IF EXISTS reservations_update_renter ON public.reservations;
CREATE POLICY reservations_update_renter
  ON public.reservations
  FOR UPDATE
  USING (renter_id = auth.uid())
  WITH CHECK (renter_id = auth.uid());