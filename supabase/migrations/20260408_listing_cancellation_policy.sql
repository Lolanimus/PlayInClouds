-- Listing cancellation policy in hours (nullable)

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS cancellation_policy_hours INTEGER;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_cancellation_policy_hours_non_negative;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_cancellation_policy_hours_non_negative
  CHECK (cancellation_policy_hours IS NULL OR cancellation_policy_hours >= 0);

-- keep value shape clean if any bad legacy data exists
UPDATE public.listings
SET cancellation_policy_hours = NULL
WHERE cancellation_policy_hours IS NOT NULL
  AND cancellation_policy_hours < 0;

-- =========================
-- LISTINGS CRUD RPCS
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
  DOUBLE PRECISION,
  TEXT
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
  p_cancellation_policy_hours INTEGER DEFAULT NULL,
  p_timezone TEXT DEFAULT 'UTC'
) RETURNS jsonb AS $$
DECLARE
  result public.listings%ROWTYPE;
  v_timezone TEXT;
BEGIN
  IF p_area_m2 <= 0 THEN
    RAISE EXCEPTION 'Area must be greater than 0 m2';
  END IF;

  IF p_cancellation_policy_hours IS NOT NULL AND p_cancellation_policy_hours < 0 THEN
    RAISE EXCEPTION 'Cancellation policy hours must be >= 0';
  END IF;

  v_timezone := public.assert_valid_timezone(p_timezone);

  INSERT INTO public.listings(
    lat,
    lng,
    address,
    title,
    subtitle,
    category,
    price,
    images,
    description,
    equipment_desc,
    conveniences_desc,
    area_m2,
    cancellation_policy_hours,
    owner_id,
    timezone
  ) VALUES (
    p_lat,
    p_lng,
    p_address,
    p_title,
    p_subtitle,
    p_category,
    p_price,
    p_images,
    p_description,
    p_equipment_desc,
    p_conveniences_desc,
    p_area_m2,
    p_cancellation_policy_hours,
    auth.uid(),
    v_timezone
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
  DOUBLE PRECISION,
  TEXT
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
  p_cancellation_policy_hours INTEGER DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  result public.listings%ROWTYPE;
  v_timezone TEXT;
BEGIN
  IF p_area_m2 IS NOT NULL AND p_area_m2 <= 0 THEN
    RAISE EXCEPTION 'Area must be greater than 0 m2';
  END IF;

  IF p_cancellation_policy_hours IS NOT NULL AND p_cancellation_policy_hours < 0 THEN
    RAISE EXCEPTION 'Cancellation policy hours must be >= 0';
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
    cancellation_policy_hours = p_cancellation_policy_hours,
    timezone = COALESCE(v_timezone, timezone)
  WHERE id = p_id
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- =========================
-- RESERVATION CANCELLATION RULES
-- =========================
CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id UUID
) RETURNS jsonb AS $$
DECLARE
  v_uid UUID;
  v_renter_id UUID;
  v_owner_id UUID;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_cancellation_policy_hours INTEGER;
  result public.reservations%ROWTYPE;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT r.renter_id, l.owner_id, r.start_at, r.end_at, l.cancellation_policy_hours
  INTO v_renter_id, v_owner_id, v_start_at, v_end_at, v_cancellation_policy_hours
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

  IF v_uid = v_renter_id THEN
    IF v_start_at <= NOW() THEN
      RAISE EXCEPTION 'Ongoing reservations cannot be cancelled by renter';
    END IF;

    IF v_cancellation_policy_hours IS NOT NULL
       AND NOW() > (v_start_at - make_interval(hours => v_cancellation_policy_hours)) THEN
      RAISE EXCEPTION 'Cancellation window has ended for this reservation';
    END IF;
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
