-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- RESET (allows rerunning this migration)
-- DROP TABLE IF EXISTS public.reviews CASCADE;
-- DROP TABLE IF EXISTS public.listings CASCADE;
-- DROP TYPE IF EXISTS public.listing_category CASCADE;

-- ENUM
CREATE TYPE public.listing_category AS ENUM (
    'REHEARSAL_SPACE',
    'RECORDING_STUDIO',
    'OTHER'
);

-- LISTINGS
CREATE TABLE public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    owner_id UUID,

    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    address TEXT NOT NULL,

    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,

    category public.listing_category NOT NULL,

    price DOUBLE PRECISION NOT NULL,

    images TEXT[] NOT NULL,
    description TEXT NOT NULL,
    equipment_desc TEXT NOT NULL DEFAULT '',
    conveniences_desc TEXT NOT NULL DEFAULT '',
    area_m2 DOUBLE PRECISION NOT NULL DEFAULT 0,

    rating_sum NUMERIC NOT NULL DEFAULT 0,
    average_rating NUMERIC(2,1) NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- REVIEWS
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    listing_id UUID NOT NULL,
    user_id UUID NOT NULL,

    rating NUMERIC(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
    text TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.listings(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user
        FOREIGN KEY (user_id)
        REFERENCES public.user(id)
        ON DELETE CASCADE
);

ALTER TABLE public.listings
    ADD CONSTRAINT fk_listing_owner
    FOREIGN KEY (owner_id)
    REFERENCES public.user(id)
    ON DELETE SET NULL;

-- INDEXES
CREATE INDEX idx_reviews_listing_id ON public.reviews(listing_id);
CREATE INDEX idx_reviews_user_id ON public.reviews(user_id);
CREATE UNIQUE INDEX one_review_per_user ON public.reviews(listing_id, user_id);

CREATE INDEX idx_listings_address ON public.listings(address);
CREATE INDEX idx_listings_category ON public.listings(category);

-- UPDATED_AT FUNCTION
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- UPDATED_AT TRIGGERS
CREATE TRIGGER set_updated_at_reviews
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_listings
BEFORE UPDATE ON public.listings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- INCREMENTAL RATING LOGIC
-- =========================

-- INSERT
CREATE OR REPLACE FUNCTION update_listing_rating_after_insert_fn()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.listings
    SET 
        rating_sum = rating_sum + NEW.rating,
        review_count = review_count + 1,
        average_rating = ROUND(
            (rating_sum + NEW.rating) / (review_count + 1),
            1
        )
    WHERE id = NEW.listing_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_listing_rating_after_insert
AFTER INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION update_listing_rating_after_insert_fn();

-- DELETE
CREATE OR REPLACE FUNCTION update_listing_rating_after_delete_fn()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.listings
    SET 
        rating_sum = rating_sum - OLD.rating,
        review_count = review_count - 1,
        average_rating = CASE 
            WHEN review_count - 1 <= 0 THEN 0
            ELSE ROUND(
                (rating_sum - OLD.rating) / (review_count - 1),
                1
            )
        END
    WHERE id = OLD.listing_id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_listing_rating_after_delete
AFTER DELETE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION update_listing_rating_after_delete_fn();

-- UPDATE (when rating changes)
CREATE OR REPLACE FUNCTION update_listing_rating_after_update_fn()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.listings
    SET 
        rating_sum = rating_sum - OLD.rating + NEW.rating,
        average_rating = CASE 
            WHEN review_count = 0 THEN 0
            ELSE ROUND(
                (rating_sum - OLD.rating + NEW.rating) / review_count,
                1
            )
        END
    WHERE id = NEW.listing_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_listing_rating_after_update
AFTER UPDATE ON public.reviews
FOR EACH ROW
WHEN (OLD.rating IS DISTINCT FROM NEW.rating)
EXECUTE FUNCTION update_listing_rating_after_update_fn();

-- =========================
-- LISTINGS CRUD FUNCTIONS
-- =========================

-- CREATE
CREATE OR REPLACE FUNCTION create_listing(
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
    p_area_m2 DOUBLE PRECISION
 ) RETURNS jsonb AS $$
DECLARE
    result public.listings%ROWTYPE;
BEGIN
    IF p_area_m2 <= 0 THEN
        RAISE EXCEPTION 'Area must be greater than 0 m2';
    END IF;

    INSERT INTO public.listings(
        lat, lng, address, title, subtitle, category, price, images, description, equipment_desc, conveniences_desc, area_m2, owner_id
    ) VALUES (
        p_lat, p_lng, p_address, p_title, p_subtitle, p_category, p_price, p_images, p_description, p_equipment_desc, p_conveniences_desc, p_area_m2, auth.uid()
    ) RETURNING * INTO result;

    RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- READ (single)
CREATE OR REPLACE FUNCTION get_listing(p_id UUID) RETURNS jsonb AS $$
DECLARE
    result public.listings%ROWTYPE;
BEGIN
    SELECT * INTO result FROM public.listings WHERE id = p_id;
    RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- LIST (with optional filters)
DROP FUNCTION IF EXISTS public.list_listings(TEXT, public.listing_category, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION list_listings(
    p_address TEXT,
        p_category public.listing_category,
        p_min_price DOUBLE PRECISION,
        p_max_price DOUBLE PRECISION,
        p_limit INTEGER DEFAULT 50,
        p_offset INTEGER DEFAULT 0
) RETURNS SETOF jsonb AS $$
BEGIN
        RETURN QUERY
        SELECT
            to_jsonb(l)
            || jsonb_build_object(
                'lat', j.lat,
                'lng', j.lng,
                'address', CASE
                    WHEN strpos(l.address, ',') > 0 THEN ltrim(substr(l.address, strpos(l.address, ',') + 1))
                    ELSE l.address
                END
            )
        FROM public.listings l
        CROSS JOIN LATERAL (
            SELECT
                -- keep marker clearly away from exact address (900m..1500m)
                l.lat + (((900 + random() * 600) / 111320.0) * cos(random() * 2 * pi())) AS lat,
                l.lng + (((900 + random() * 600) / (111320.0 * GREATEST(abs(cos(radians(l.lat))), 1e-6))) * sin(random() * 2 * pi())) AS lng
        ) j
        WHERE (p_address IS NULL OR l.address = p_address)
            AND (p_category IS NULL OR l.category = p_category)
            AND (p_min_price IS NULL OR l.price >= p_min_price)
            AND (p_max_price IS NULL OR l.price <= p_max_price)
        ORDER BY l.created_at DESC
        LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- UPDATE (partial; use NULL to keep existing values)
CREATE OR REPLACE FUNCTION update_listing(
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
    p_area_m2 DOUBLE PRECISION DEFAULT NULL
 ) RETURNS jsonb AS $$
DECLARE
    result public.listings%ROWTYPE;
BEGIN
    IF p_area_m2 IS NOT NULL AND p_area_m2 <= 0 THEN
        RAISE EXCEPTION 'Area must be greater than 0 m2';
    END IF;

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
        area_m2 = COALESCE(p_area_m2, area_m2)
    WHERE id = p_id
    RETURNING * INTO result;

    RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- DELETE
CREATE OR REPLACE FUNCTION delete_listing(p_id UUID) RETURNS boolean AS $$
DECLARE
    v_deleted_id UUID;
BEGIN
    DELETE FROM public.listings WHERE id = p_id RETURNING id INTO v_deleted_id;
    RETURN v_deleted_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- =========================
-- REVIEWS CRUD FUNCTIONS
-- =========================

-- CREATE
CREATE OR REPLACE FUNCTION create_review(
    p_listing_id UUID,
    p_user_id UUID,
    p_rating NUMERIC,
    p_text TEXT
) RETURNS jsonb AS $$
DECLARE
    result public.reviews%ROWTYPE;
BEGIN
    INSERT INTO public.reviews(listing_id, user_id, rating, text)
    VALUES (p_listing_id, p_user_id, p_rating, p_text)
    RETURNING * INTO result;

    RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- READ (single)
CREATE OR REPLACE FUNCTION get_review(p_id UUID) RETURNS jsonb AS $$
DECLARE
    result public.reviews%ROWTYPE;
BEGIN
    SELECT * INTO result FROM public.reviews WHERE id = p_id;
    RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- LIST (optionally by listing)
DROP FUNCTION IF EXISTS public.list_reviews(UUID, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION list_reviews(
    p_listing_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS SETOF jsonb AS $$
BEGIN
    RETURN QUERY
    SELECT to_jsonb(r) FROM public.reviews r
    WHERE (p_listing_id IS NULL OR r.listing_id = p_listing_id)
    ORDER BY r.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- UPDATE (partial)
CREATE OR REPLACE FUNCTION update_review(
    p_id UUID,
    p_rating NUMERIC DEFAULT NULL,
    p_text TEXT DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    result public.reviews%ROWTYPE;
BEGIN
    UPDATE public.reviews
    SET
        rating = COALESCE(p_rating, rating),
        text = COALESCE(p_text, text)
    WHERE id = p_id
    RETURNING * INTO result;

    RETURN to_jsonb(result);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- DELETE
CREATE OR REPLACE FUNCTION delete_review(p_id UUID) RETURNS boolean AS $$
DECLARE
    v_deleted_id UUID;
BEGIN
    DELETE FROM public.reviews WHERE id = p_id RETURNING id INTO v_deleted_id;
    RETURN v_deleted_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- =========================
-- ROW LEVEL SECURITY POLICIES
-- =========================

-- Enable RLS on tables
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Listings policies
CREATE POLICY "listings_public_select" ON public.listings
    FOR SELECT USING (true);

CREATE POLICY "listings_insert_authenticated" ON public.listings
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "listings_update_owner" ON public.listings
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "listings_delete_owner" ON public.listings
    FOR DELETE USING (owner_id = auth.uid());

-- Reviews policies
CREATE POLICY "reviews_public_select" ON public.reviews
    FOR SELECT USING (true);

CREATE POLICY "reviews_insert_authenticated" ON public.reviews
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "reviews_update_owner" ON public.reviews
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "reviews_delete_owner" ON public.reviews
    FOR DELETE USING (user_id = auth.uid());