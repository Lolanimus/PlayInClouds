-- Listing instant booking policy table + rules-based reservation status

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.listing_booking_policies (
  listing_id UUID PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  instant_booking BOOLEAN NOT NULL DEFAULT false,
  min_past_bookings INTEGER NULL
    CHECK (min_past_bookings IS NULL OR min_past_bookings >= 0),
  min_reviews INTEGER NULL
    CHECK (min_reviews IS NULL OR min_reviews >= 0),
  require_id_verified BOOLEAN NOT NULL DEFAULT false,
  extra_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.listing_booking_policies
  DROP CONSTRAINT IF EXISTS listing_booking_policies_extra_rules_object;

ALTER TABLE public.listing_booking_policies
  ADD CONSTRAINT listing_booking_policies_extra_rules_object
  CHECK (jsonb_typeof(extra_rules) = 'object');

CREATE INDEX IF NOT EXISTS idx_listing_booking_policies_instant_booking
  ON public.listing_booking_policies (instant_booking)
  WHERE instant_booking = true;

DROP TRIGGER IF EXISTS set_updated_at_listing_booking_policies ON public.listing_booking_policies;
CREATE TRIGGER set_updated_at_listing_booking_policies
BEFORE UPDATE ON public.listing_booking_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.listing_booking_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_booking_policies_public_select ON public.listing_booking_policies;
CREATE POLICY listing_booking_policies_public_select
ON public.listing_booking_policies
FOR SELECT
USING (true);

DROP POLICY IF EXISTS listing_booking_policies_owner_manage ON public.listing_booking_policies;
CREATE POLICY listing_booking_policies_owner_manage
ON public.listing_booking_policies
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = listing_id
      AND l.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = listing_id
      AND l.owner_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.get_listing_booking_policy(
  p_listing_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_exists BOOLEAN;
  result public.listing_booking_policies%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = p_listing_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  SELECT *
  INTO result
  FROM public.listing_booking_policies p
  WHERE p.listing_id = p_listing_id;

  IF result.listing_id IS NULL THEN
    RETURN jsonb_build_object(
      'listing_id', p_listing_id,
      'instant_booking', false,
      'min_past_bookings', NULL,
      'min_reviews', NULL,
      'require_id_verified', false,
      'extra_rules', '{}'::jsonb
    );
  END IF;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE OR REPLACE FUNCTION public.upsert_listing_booking_policy(
  p_listing_id UUID,
  p_policy JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_uid UUID;
  v_owner_id UUID;
  v_existing public.listing_booking_policies%ROWTYPE;
  v_instant_booking BOOLEAN;
  v_min_past_bookings INTEGER;
  v_min_reviews INTEGER;
  v_require_id_verified BOOLEAN;
  v_extra_rules JSONB;
  v_policy JSONB;
  result public.listing_booking_policies%ROWTYPE;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT l.owner_id
  INTO v_owner_id
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_owner_id <> v_uid THEN
    RAISE EXCEPTION 'Only listing owner can update booking policy';
  END IF;

  v_policy := COALESCE(p_policy, '{}'::jsonb);

  IF jsonb_typeof(v_policy) <> 'object' THEN
    RAISE EXCEPTION 'p_policy must be a JSON object';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.listing_booking_policies p
  WHERE p.listing_id = p_listing_id;

  v_instant_booking := COALESCE(
    (v_policy ->> 'instant_booking')::BOOLEAN,
    v_existing.instant_booking,
    false
  );

  v_min_past_bookings :=
    CASE
      WHEN v_policy ? 'min_past_bookings' THEN (v_policy ->> 'min_past_bookings')::INTEGER
      ELSE v_existing.min_past_bookings
    END;

  v_min_reviews :=
    CASE
      WHEN v_policy ? 'min_reviews' THEN (v_policy ->> 'min_reviews')::INTEGER
      ELSE v_existing.min_reviews
    END;

  v_require_id_verified := COALESCE(
    (v_policy ->> 'require_id_verified')::BOOLEAN,
    v_existing.require_id_verified,
    false
  );

  v_extra_rules :=
    CASE
      WHEN v_policy ? 'extra_rules' THEN COALESCE(v_policy -> 'extra_rules', '{}'::jsonb)
      ELSE COALESCE(v_existing.extra_rules, '{}'::jsonb)
    END;

  IF v_min_past_bookings IS NOT NULL AND v_min_past_bookings < 0 THEN
    RAISE EXCEPTION 'min_past_bookings must be >= 0';
  END IF;

  IF v_min_reviews IS NOT NULL AND v_min_reviews < 0 THEN
    RAISE EXCEPTION 'min_reviews must be >= 0';
  END IF;

  IF jsonb_typeof(v_extra_rules) <> 'object' THEN
    RAISE EXCEPTION 'extra_rules must be a JSON object';
  END IF;

  INSERT INTO public.listing_booking_policies (
    listing_id,
    instant_booking,
    min_past_bookings,
    min_reviews,
    require_id_verified,
    extra_rules
  ) VALUES (
    p_listing_id,
    v_instant_booking,
    v_min_past_bookings,
    v_min_reviews,
    v_require_id_verified,
    v_extra_rules
  )
  ON CONFLICT (listing_id)
  DO UPDATE SET
    instant_booking = EXCLUDED.instant_booking,
    min_past_bookings = EXCLUDED.min_past_bookings,
    min_reviews = EXCLUDED.min_reviews,
    require_id_verified = EXCLUDED.require_id_verified,
    extra_rules = EXCLUDED.extra_rules
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_listing_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_guests INTEGER DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
  v_uid UUID;
  v_listing_exists BOOLEAN;
  v_instant_booking BOOLEAN := false;
  v_min_past_bookings INTEGER := NULL;
  v_min_reviews INTEGER := NULL;
  v_require_id_verified BOOLEAN := false;
  v_user_past_bookings INTEGER := 0;
  v_user_reviews INTEGER := 0;
  v_user_id_verified BOOLEAN := false;
  v_rules_passed BOOLEAN := true;
  v_status public.reservation_status := 'PENDING';
  result public.reservations%ROWTYPE;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.listings l WHERE l.id = p_listing_id)
  INTO v_listing_exists;

  IF NOT v_listing_exists THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  SELECT
    COALESCE(p.instant_booking, false),
    p.min_past_bookings,
    p.min_reviews,
    COALESCE(p.require_id_verified, false)
  INTO
    v_instant_booking,
    v_min_past_bookings,
    v_min_reviews,
    v_require_id_verified
  FROM public.listings l
  LEFT JOIN public.listing_booking_policies p ON p.listing_id = l.id
  WHERE l.id = p_listing_id;

  IF v_instant_booking THEN
    IF v_min_past_bookings IS NOT NULL THEN
      SELECT COUNT(*)::INTEGER
      INTO v_user_past_bookings
      FROM public.reservations r
      WHERE r.renter_id = v_uid
        AND r.status = 'CONFIRMED'
        AND r.end_at <= NOW();

      IF v_user_past_bookings < v_min_past_bookings THEN
        v_rules_passed := false;
      END IF;
    END IF;

    IF v_rules_passed AND v_min_reviews IS NOT NULL THEN
      SELECT COUNT(*)::INTEGER
      INTO v_user_reviews
      FROM public.reviews rv
      WHERE rv.user_id = v_uid;

      IF v_user_reviews < v_min_reviews THEN
        v_rules_passed := false;
      END IF;
    END IF;

    IF v_rules_passed AND v_require_id_verified THEN
      SELECT (u.id_verified_at IS NOT NULL)
      INTO v_user_id_verified
      FROM public."user" u
      WHERE u.id = v_uid;

      IF COALESCE(v_user_id_verified, false) = false THEN
        v_rules_passed := false;
      END IF;
    END IF;

    IF v_rules_passed THEN
      v_status := 'CONFIRMED';
    END IF;
  END IF;

  INSERT INTO public.reservations (listing_id, renter_id, start_at, end_at, guests, status)
  VALUES (p_listing_id, v_uid, p_start_at, p_end_at, p_guests, v_status)
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';
