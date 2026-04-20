do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'listing_moderation_status'
      and n.nspname = 'public'
  ) then
    create type public.listing_moderation_status as enum (
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED'
    );
  end if;
end
$$;

alter table public."user"
  add column if not exists is_admin boolean not null default false;

alter table public.listings
  add column if not exists moderation_status public.listing_moderation_status,
  add column if not exists moderation_message text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public."user"(id) on delete set null;

update public.listings
set
  moderation_status = coalesce(moderation_status, 'APPROVED'::public.listing_moderation_status),
  submitted_at = coalesce(submitted_at, created_at, now())
where moderation_status is null
   or submitted_at is null;

alter table public.listings
  alter column moderation_status set default 'PENDING_APPROVAL'::public.listing_moderation_status,
  alter column moderation_status set not null,
  alter column submitted_at set default now(),
  alter column submitted_at set not null;

create or replace function public.current_user_is_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  select coalesce(u.is_admin, false)
  into v_is_admin
  from public."user" u
  where u.id = v_uid;

  return coalesce(v_is_admin, false);
end;
$function$;

drop function if exists public.create_listing(
  double precision,
  double precision,
  text,
  text,
  text,
  public.listing_category,
  double precision,
  text[],
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  text,
  text,
  text,
  text
);

create or replace function public.create_listing(
  p_lat double precision,
  p_lng double precision,
  p_address text,
  p_title text,
  p_subtitle text,
  p_category public.listing_category,
  p_price double precision,
  p_images text[],
  p_description text,
  p_equipment_desc text,
  p_conveniences_desc text,
  p_area_m2 double precision,
  p_cancellation_policy_hours integer default null,
  p_advance_notice_hours integer default null,
  p_timezone text default 'UTC',
  p_host_confirmation_message text default '',
  p_rules text default '',
  p_instructions text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result public.listings%rowtype;
  v_timezone text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_area_m2 <= 0 then
    raise exception 'Area must be greater than 0 m2';
  end if;

  if p_cancellation_policy_hours is not null and p_cancellation_policy_hours < 0 then
    raise exception 'Cancellation policy hours must be >= 0';
  end if;

  if p_advance_notice_hours is not null and p_advance_notice_hours < 0 then
    raise exception 'Advance notice hours must be >= 0';
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
    cancellation_policy_hours,
    advance_notice_hours,
    owner_id,
    timezone,
    host_confirmation_message,
    rules,
    instructions,
    moderation_status,
    moderation_message,
    submitted_at,
    reviewed_at,
    reviewed_by
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
    p_cancellation_policy_hours,
    p_advance_notice_hours,
    v_uid,
    v_timezone,
    coalesce(p_host_confirmation_message, ''),
    coalesce(p_rules, ''),
    coalesce(p_instructions, ''),
    'PENDING_APPROVAL'::public.listing_moderation_status,
    null,
    now(),
    null,
    null
  ) returning * into result;

  return to_jsonb(result);
end;
$function$;

create or replace function public.get_listing(
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result public.listings%rowtype;
  v_uid uuid := auth.uid();
begin
  select *
  into result
  from public.listings l
  where l.id = p_id
    and (
      l.moderation_status = 'APPROVED'::public.listing_moderation_status
      or l.owner_id = v_uid
      or public.current_user_is_admin()
    );

  return to_jsonb(result);
end;
$function$;

drop function if exists public.list_listings(text, public.listing_category, double precision, double precision, integer, integer);
create or replace function public.list_listings(
  p_address text,
  p_category public.listing_category,
  p_min_price double precision,
  p_max_price double precision,
  p_limit integer default 50,
  p_offset integer default 0
) returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  select
    to_jsonb(l)
    || jsonb_build_object(
      'lat', j.lat,
      'lng', j.lng,
      'address', case
        when strpos(l.address, ',') > 0 then ltrim(substr(l.address, strpos(l.address, ',') + 1))
        else l.address
      end
    )
  from public.listings l
  cross join lateral (
    select
      l.lat + (((900 + random() * 600) / 111320.0) * cos(random() * 2 * pi())) as lat,
      l.lng + (((900 + random() * 600) / (111320.0 * greatest(abs(cos(radians(l.lat))), 1e-6))) * sin(random() * 2 * pi())) as lng
  ) j
  where l.moderation_status = 'APPROVED'::public.listing_moderation_status
    and (p_address is null or l.address = p_address)
    and (p_category is null or l.category = p_category)
    and (p_min_price is null or l.price >= p_min_price)
    and (p_max_price is null or l.price <= p_max_price)
  order by l.created_at desc
  limit p_limit offset p_offset;
end;
$function$;

create or replace function public.list_own_listings()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select to_jsonb(l)
  from public.listings l
  where l.owner_id = v_uid
  order by l.updated_at desc, l.created_at desc;
end;
$function$;

create or replace function public.list_pending_listings()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select jsonb_build_object(
    'id', l.id,
    'owner_id', l.owner_id,
    'lat', l.lat,
    'lng', l.lng,
    'timezone', l.timezone,
    'address', l.address,
    'title', l.title,
    'subtitle', l.subtitle,
    'rules', l.rules,
    'instructions', l.instructions,
    'host_confirmation_message', l.host_confirmation_message,
    'category', l.category,
    'price', l.price,
    'images', l.images,
    'description', l.description,
    'equipment_desc', l.equipment_desc,
    'conveniences_desc', l.conveniences_desc,
    'area_m2', l.area_m2,
    'cancellation_policy_hours', l.cancellation_policy_hours,
    'advance_notice_hours', l.advance_notice_hours,
    'rating_sum', l.rating_sum,
    'average_rating', l.average_rating,
    'review_count', l.review_count,
    'moderation_status', l.moderation_status,
    'moderation_message', l.moderation_message,
    'submitted_at', l.submitted_at,
    'reviewed_at', l.reviewed_at,
    'reviewed_by', l.reviewed_by,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'owner_name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Host'),
    'owner_email', u.email
  )
  from public.listings l
  left join public."user" u on u.id = l.owner_id
  where l.moderation_status = 'PENDING_APPROVAL'::public.listing_moderation_status
  order by l.submitted_at asc, l.created_at asc;
end;
$function$;

create or replace function public.approve_listing(
  p_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  result public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.listings l
  set
    moderation_status = 'APPROVED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  return to_jsonb(result);
end;
$function$;

create or replace function public.reject_listing(
  p_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  result public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.listings l
  set
    moderation_status = 'REJECTED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  return to_jsonb(result);
end;
$function$;

drop function if exists public.update_listing(
  uuid,
  double precision,
  double precision,
  text,
  text,
  text,
  public.listing_category,
  double precision,
  text[],
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  text,
  text,
  text,
  text
);

create or replace function public.update_listing(
  p_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_address text default null,
  p_title text default null,
  p_subtitle text default null,
  p_category public.listing_category default null,
  p_price double precision default null,
  p_images text[] default null,
  p_description text default null,
  p_equipment_desc text default null,
  p_conveniences_desc text default null,
  p_area_m2 double precision default null,
  p_cancellation_policy_hours integer default null,
  p_advance_notice_hours integer default null,
  p_timezone text default null,
  p_host_confirmation_message text default null,
  p_rules text default null,
  p_instructions text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result public.listings%rowtype;
  v_timezone text;
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_current_status public.listing_moderation_status;
  v_is_admin boolean;
  v_resubmit boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select l.owner_id, l.moderation_status
  into v_owner_id, v_current_status
  from public.listings l
  where l.id = p_id;

  if v_owner_id is null then
    raise exception 'Listing not found';
  end if;

  v_is_admin := public.current_user_is_admin();

  if v_owner_id <> v_uid and not v_is_admin then
    raise exception 'Only the listing owner or an admin can update this listing';
  end if;

  if p_area_m2 is not null and p_area_m2 <= 0 then
    raise exception 'Area must be greater than 0 m2';
  end if;

  if p_cancellation_policy_hours is not null and p_cancellation_policy_hours < 0 then
    raise exception 'Cancellation policy hours must be >= 0';
  end if;

  if p_advance_notice_hours is not null and p_advance_notice_hours < 0 then
    raise exception 'Advance notice hours must be >= 0';
  end if;

  v_timezone := case
    when p_timezone is null then null
    else public.assert_valid_timezone(p_timezone)
  end;

  v_resubmit := v_owner_id = v_uid and v_current_status = 'REJECTED'::public.listing_moderation_status;

  update public.listings l
  set
    lat = coalesce(p_lat, l.lat),
    lng = coalesce(p_lng, l.lng),
    address = coalesce(p_address, l.address),
    title = coalesce(p_title, l.title),
    subtitle = coalesce(p_subtitle, l.subtitle),
    category = coalesce(p_category, l.category),
    price = coalesce(p_price, l.price),
    images = coalesce(p_images, l.images),
    description = coalesce(p_description, l.description),
    equipment_desc = coalesce(p_equipment_desc, l.equipment_desc),
    conveniences_desc = coalesce(p_conveniences_desc, l.conveniences_desc),
    area_m2 = coalesce(p_area_m2, l.area_m2),
    cancellation_policy_hours = p_cancellation_policy_hours,
    advance_notice_hours = p_advance_notice_hours,
    timezone = coalesce(v_timezone, l.timezone),
    host_confirmation_message = coalesce(p_host_confirmation_message, l.host_confirmation_message),
    rules = coalesce(p_rules, l.rules),
    instructions = coalesce(p_instructions, l.instructions),
    moderation_status = case
      when v_resubmit then 'PENDING_APPROVAL'::public.listing_moderation_status
      else l.moderation_status
    end,
    moderation_message = case
      when v_resubmit then null
      else l.moderation_message
    end,
    reviewed_at = case
      when v_resubmit then null
      else l.reviewed_at
    end,
    reviewed_by = case
      when v_resubmit then null
      else l.reviewed_by
    end,
    submitted_at = case
      when v_resubmit then now()
      else l.submitted_at
    end
  where l.id = p_id
  returning * into result;

  return to_jsonb(result);
end;
$function$;

create or replace function public.create_reservation(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer default 1
) returns jsonb as $function$
declare
  v_uid uuid;
  v_listing_exists boolean;
  v_listing_status public.listing_moderation_status;
  v_instant_booking boolean := false;
  v_min_past_bookings integer := null;
  v_min_reviews integer := null;
  v_require_id_verified boolean := false;
  v_user_past_bookings integer := 0;
  v_user_reviews integer := 0;
  v_user_id_verified boolean := false;
  v_rules_passed boolean := true;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select exists (select 1 from public.listings l where l.id = p_listing_id), max(l.moderation_status)
  into v_listing_exists, v_listing_status
  from public.listings l
  where l.id = p_listing_id;

  if not v_listing_exists then
    raise exception 'Listing not found';
  end if;

  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;

  select
    coalesce(p.instant_booking, false),
    p.min_past_bookings,
    p.min_reviews,
    coalesce(p.require_id_verified, false)
  into
    v_instant_booking,
    v_min_past_bookings,
    v_min_reviews,
    v_require_id_verified
  from public.listings l
  left join public.listing_booking_policies p on p.listing_id = l.id
  where l.id = p_listing_id;

  if v_instant_booking then
    if v_min_past_bookings is not null then
      select count(*)::integer
      into v_user_past_bookings
      from public.reservations r
      where r.renter_id = v_uid
        and r.status = 'CONFIRMED'
        and r.end_at <= now();

      if v_user_past_bookings < v_min_past_bookings then
        v_rules_passed := false;
      end if;
    end if;

    if v_rules_passed and v_min_reviews is not null then
      select count(*)::integer
      into v_user_reviews
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role;

      if v_user_reviews < v_min_reviews then
        v_rules_passed := false;
      end if;
    end if;

    if v_rules_passed and v_require_id_verified then
      select (u.id_verified_at is not null)
      into v_user_id_verified
      from public."user" u
      where u.id = v_uid;

      if coalesce(v_user_id_verified, false) = false then
        v_rules_passed := false;
      end if;
    end if;
  end if;

  insert into public.reservations (listing_id, renter_id, start_at, end_at, guests, status)
  values (p_listing_id, v_uid, p_start_at, p_end_at, p_guests, 'PENDING')
  returning * into result;

  if v_instant_booking and v_rules_passed then
    select * into result
    from public.confirm_reservation_internal(result.id, false);
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql set search_path = '';

drop policy if exists "listings_public_select" on public.listings;
create policy "listings_public_select" on public.listings
  for select
  using (
    moderation_status = 'APPROVED'::public.listing_moderation_status
    or owner_id = auth.uid()
    or public.current_user_is_admin()
  );

grant execute on function public.current_user_is_admin() to authenticated, service_role;
grant execute on function public.list_own_listings() to authenticated, service_role;
grant execute on function public.list_pending_listings() to authenticated, service_role;
grant execute on function public.approve_listing(uuid, text) to authenticated, service_role;
grant execute on function public.reject_listing(uuid, text) to authenticated, service_role;
