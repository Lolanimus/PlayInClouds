drop extension if exists "pg_net";

alter table "public"."reservations" drop constraint "reservations_listing_id_fkey";

drop function if exists "public"."get_user_id_by_username"(target_username text);

alter table "public"."listings" alter column "owner_id" set not null;

CREATE UNIQUE INDEX user_email_key1 ON public."user" USING btree (email);

alter table "public"."listings" add constraint "listings_minimum_advance_booking_hours_non_negative" CHECK (((advance_notice_hours IS NULL) OR (advance_notice_hours >= 0))) not valid;

alter table "public"."listings" validate constraint "listings_minimum_advance_booking_hours_non_negative";

alter table "public"."user" add constraint "user_email_key1" UNIQUE using index "user_email_key1";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_minimum_advance_booking_start_at(p_timezone text, p_minimum_advance_booking_hours integer, p_reference_at timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
	v_local_now TIMESTAMP;
	v_local_min_start TIMESTAMP;
BEGIN
	IF p_minimum_advance_booking_hours IS NULL THEN
		RETURN NULL;
	END IF;

	v_local_now := p_reference_at AT TIME ZONE COALESCE(p_timezone, 'UTC');
	v_local_min_start := date_trunc('hour', v_local_now);

	IF v_local_min_start < v_local_now THEN
		v_local_min_start := v_local_min_start + INTERVAL '1 hour';
	END IF;

	v_local_min_start := v_local_min_start + make_interval(hours => GREATEST(p_minimum_advance_booking_hours, 0));

	RETURN v_local_min_start AT TIME ZONE COALESCE(p_timezone, 'UTC');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_listing(p_lat double precision, p_lng double precision, p_address text, p_title text, p_subtitle text, p_category public.listing_category, p_price double precision, p_images text[], p_description text, p_equipment_desc text, p_conveniences_desc text, p_area_m2 double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_listing(p_lat double precision, p_lng double precision, p_address text, p_title text, p_subtitle text, p_category public.listing_category, p_price double precision, p_images text[], p_description text, p_equipment_desc text, p_conveniences_desc text, p_area_m2 double precision, p_timezone text DEFAULT 'UTC'::text, p_host_confirmation_message text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  result public.listings%rowtype;
  v_timezone text;
begin
  if p_area_m2 <= 0 then
    raise exception 'Area must be greater than 0 m2';
  end if;

  v_timezone := public.assert_valid_timezone(p_timezone);

  insert into public.listings(
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
    timezone,
    host_confirmation_message
  ) values (
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
    v_timezone,
    coalesce(p_host_confirmation_message, '')
  ) returning * into result;

  return to_jsonb(result);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_user_future_reservations(p_renter_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_listing_weekly_slots(p_listing_id uuid, p_slot_prices double precision[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_count INTEGER;
  v_is_owner BOOLEAN;
BEGIN
  v_count := COALESCE(array_length(p_slot_prices, 1), 0);

  IF v_count <> 168 THEN
    RAISE EXCEPTION 'p_slot_prices must contain exactly 168 values, got %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_slot_prices) AS rate
    WHERE rate IS NOT NULL AND rate <= 0
  ) THEN
    RAISE EXCEPTION 'All slot prices must be NULL (closed) or greater than 0';
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

  -- Replace existing slots atomically
  DELETE FROM public.listing_weekly_slots
  WHERE listing_id = p_listing_id;

  -- Map each array element to weekday/hour slot
  INSERT INTO public.listing_weekly_slots (listing_id, weekday, hour, price)
  SELECT
    p_listing_id,
    ((idx - 1) / 24)::SMALLINT AS weekday,
    ((idx - 1) % 24)::SMALLINT AS hour,
    p_slot_prices[idx] AS price
  FROM generate_series(1, 168) AS gs(idx);

  RETURN jsonb_build_object(
    'listing_id', p_listing_id,
    'weekly_slots_saved', v_count,
    'closed_slots', (SELECT COUNT(*) FROM unnest(p_slot_prices) AS rate WHERE rate IS NULL)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_listing(p_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_address text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_subtitle text DEFAULT NULL::text, p_category public.listing_category DEFAULT NULL::public.listing_category, p_price double precision DEFAULT NULL::double precision, p_images text[] DEFAULT NULL::text[], p_description text DEFAULT NULL::text, p_equipment_desc text DEFAULT NULL::text, p_conveniences_desc text DEFAULT NULL::text, p_area_m2 double precision DEFAULT NULL::double precision, p_timezone text DEFAULT NULL::text, p_host_confirmation_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare
  result public.listings%rowtype;
  v_timezone text;
begin
  if p_area_m2 is not null and p_area_m2 <= 0 then
    raise exception 'Area must be greater than 0 m2';
  end if;

  v_timezone := case
    when p_timezone is null then null
    else public.assert_valid_timezone(p_timezone)
  end;

  update public.listings
  set
    lat = coalesce(p_lat, lat),
    lng = coalesce(p_lng, lng),
    address = coalesce(p_address, address),
    title = coalesce(p_title, title),
    subtitle = coalesce(p_subtitle, subtitle),
    category = coalesce(p_category, category),
    price = coalesce(p_price, price),
    images = coalesce(p_images, images),
    description = coalesce(p_description, description),
    equipment_desc = coalesce(p_equipment_desc, equipment_desc),
    conveniences_desc = coalesce(p_conveniences_desc, conveniences_desc),
    area_m2 = coalesce(p_area_m2, area_m2),
    timezone = coalesce(v_timezone, timezone),
    host_confirmation_message = coalesce(p_host_confirmation_message, host_confirmation_message)
  where id = p_id
  returning * into result;

  return to_jsonb(result);
end;$function$
;


  create policy "authenticated_users_can_receive"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using (true);



  create policy "authenticated_users_can_send"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow_public_image_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'your_bucket_name'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND ((metadata ->> 'mimetype'::text) ~~ 'image/%'::text) AND (auth.role() = 'anon'::text)));



