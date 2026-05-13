-- Replace legacy amenities[] with text descriptions and area

-- =========================
-- TABLE SHAPE
-- =========================
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS equipment_desc TEXT,
  ADD COLUMN IF NOT EXISTS conveniences_desc TEXT,
  ADD COLUMN IF NOT EXISTS area_m2 DOUBLE PRECISION;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'amenities'
  ) THEN
    EXECUTE $sql$
      UPDATE public.listings
      SET
        equipment_desc = COALESCE(equipment_desc, array_to_string(amenities, E'\n')),
        conveniences_desc = COALESCE(conveniences_desc, array_to_string(amenities, E'\n'))
      WHERE amenities IS NOT NULL
    $sql$;

    ALTER TABLE public.listings DROP COLUMN IF EXISTS amenities;
  END IF;
END $do$;

UPDATE public.listings
SET equipment_desc = COALESCE(equipment_desc, '')
WHERE equipment_desc IS NULL;

UPDATE public.listings
SET conveniences_desc = COALESCE(conveniences_desc, '')
WHERE conveniences_desc IS NULL;

UPDATE public.listings
SET area_m2 = COALESCE(area_m2, 0)
WHERE area_m2 IS NULL;

ALTER TABLE public.listings
  ALTER COLUMN equipment_desc SET DEFAULT '',
  ALTER COLUMN conveniences_desc SET DEFAULT '',
  ALTER COLUMN area_m2 SET DEFAULT 0;

ALTER TABLE public.listings
  ALTER COLUMN equipment_desc SET NOT NULL,
  ALTER COLUMN conveniences_desc SET NOT NULL,
  ALTER COLUMN area_m2 SET NOT NULL;

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
  TEXT[],
  TEXT
);

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
  TEXT[]
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
  TEXT[],
  TEXT
);

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
  TEXT[]
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
