alter table public.listings
  add column if not exists rules text,
  add column if not exists instructions text;

update public.listings
set
  rules = coalesce(rules, ''),
  instructions = coalesce(instructions, '')
where rules is null or instructions is null;

alter table public.listings
  alter column rules set default '',
  alter column rules set not null,
  alter column instructions set default '',
  alter column instructions set not null;

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
) returns jsonb as $$
declare
  result public.listings%rowtype;
  v_timezone text;
begin
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
    instructions
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
    auth.uid(),
    v_timezone,
    coalesce(p_host_confirmation_message, ''),
    coalesce(p_rules, ''),
    coalesce(p_instructions, '')
  ) returning * into result;

  return to_jsonb(result);
end;
$$ language plpgsql set search_path = '';

create or replace function public.confirm_reservation_internal(
  p_reservation_id uuid,
  p_require_owner boolean default true
) returns public.reservations as $$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_end_at timestamptz;
  v_renter_id uuid;
  v_listing_id uuid;
  v_host_confirmation_message text;
  v_chat jsonb;
  v_chat_id uuid;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select l.owner_id, r.end_at, r.renter_id, r.listing_id, l.host_confirmation_message
  into v_owner_id, v_end_at, v_renter_id, v_listing_id, v_host_confirmation_message
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if p_require_owner and v_owner_id <> v_uid then
    raise exception 'Only listing owner can confirm this reservation';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be confirmed';
  end if;

  update public.reservations r
  set status = 'CONFIRMED'
  where r.id = p_reservation_id
    and r.status = 'PENDING'
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already confirmed or cancelled';
  end if;

  if btrim(coalesce(v_host_confirmation_message, '')) <> '' then
    v_chat := public.create_direct_chat(v_renter_id, v_listing_id);
    v_chat_id := nullif(v_chat ->> 'id', '')::uuid;

    if v_chat_id is not null then
      insert into public.chat_messages (sender_id, chat_id, contents)
      values (v_owner_id, v_chat_id, btrim(v_host_confirmation_message));
    end if;
  end if;

  return result;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.confirm_reservation(
  p_reservation_id uuid
) returns jsonb as $$
declare
  result public.reservations%rowtype;
begin
  select * into result
  from public.confirm_reservation_internal(p_reservation_id, true);

  return to_jsonb(result);
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.create_reservation(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer default 1
) returns jsonb as $$
declare
  v_uid uuid;
  v_listing_exists boolean;
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

  select exists (select 1 from public.listings l where l.id = p_listing_id)
  into v_listing_exists;

  if not v_listing_exists then
    raise exception 'Listing not found';
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
      from public.reviews rv
      where rv.user_id = v_uid;

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
$$ language plpgsql set search_path = '';

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
) returns jsonb as $$
declare
  result public.listings%rowtype;
  v_timezone text;
begin
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
    cancellation_policy_hours = p_cancellation_policy_hours,
    advance_notice_hours = p_advance_notice_hours,
    timezone = coalesce(v_timezone, timezone),
    host_confirmation_message = coalesce(p_host_confirmation_message, host_confirmation_message),
    rules = coalesce(p_rules, rules),
    instructions = coalesce(p_instructions, instructions)
  where id = p_id
  returning * into result;

  return to_jsonb(result);
end;
$$ language plpgsql set search_path = '';