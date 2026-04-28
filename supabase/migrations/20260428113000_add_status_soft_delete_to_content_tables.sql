do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'record_status'
      and n.nspname = 'public'
  ) then
    create type public.record_status as enum ('ACTIVE', 'DELETED');
  end if;
end
$$;

alter table public.listings
  add column if not exists status public.record_status;

update public.listings
set status = 'ACTIVE'::public.record_status
where status is null;

alter table public.listings
  alter column status set default 'ACTIVE'::public.record_status,
  alter column status set not null;

alter table public.chats
  add column if not exists status public.record_status;

update public.chats
set status = 'ACTIVE'::public.record_status
where status is null;

alter table public.chats
  alter column status set default 'ACTIVE'::public.record_status,
  alter column status set not null;

alter table public.chat_messages
  add column if not exists status public.record_status;

update public.chat_messages
set status = 'ACTIVE'::public.record_status
where status is null;

alter table public.chat_messages
  alter column status set default 'ACTIVE'::public.record_status,
  alter column status set not null;

alter table public.reservation_reviews
  add column if not exists status public.record_status;

update public.reservation_reviews
set status = 'ACTIVE'::public.record_status
where status is null;

alter table public.reservation_reviews
  alter column status set default 'ACTIVE'::public.record_status,
  alter column status set not null;

alter table public.notifications
  add column if not exists status public.record_status;

update public.notifications
set status = 'ACTIVE'::public.record_status
where status is null;

alter table public.notifications
  alter column status set default 'ACTIVE'::public.record_status,
  alter column status set not null;

create index if not exists idx_listings_active_created_at
  on public.listings(created_at desc)
  where status = 'ACTIVE'::public.record_status;

create index if not exists idx_listings_owner_active_updated_at
  on public.listings(owner_id, updated_at desc, created_at desc)
  where status = 'ACTIVE'::public.record_status;

create index if not exists idx_chats_active_listing_id
  on public.chats(listing_id, id)
  where status = 'ACTIVE'::public.record_status;

create index if not exists idx_chat_messages_active_chat_created_at
  on public.chat_messages(chat_id, created_at desc)
  where status = 'ACTIVE'::public.record_status;

create index if not exists idx_reservation_reviews_active_listing_created_at
  on public.reservation_reviews(listing_id, created_at desc)
  where status = 'ACTIVE'::public.record_status;

create index if not exists idx_reservation_reviews_active_reviewer_listing
  on public.reservation_reviews(reviewer_user_id, listing_id, reviewee_user_id)
  where status = 'ACTIVE'::public.record_status;

create index if not exists idx_notifications_active_user_created_at
  on public.notifications(user_id, created_at desc)
  where status = 'ACTIVE'::public.record_status;

create or replace function public.get_public_profile(
  p_user_id uuid,
  p_limit integer default 12,
  p_offset integer default 0
) returns jsonb
language sql
security definer
set search_path to ''
as $function$
  with viewer as (
    select public.current_user_can_view_deleted_rows() as can_view_deleted
  ),
  profile_user as (
    select u.id, u.first_name, u.last_name, u.inserted_at, u.id_verified_at
    from public."user" u
    where u.id = p_user_id
      and public.current_user_can_view_user(u.id)
  ),
  hosting_stats as (
    select
      count(*)::integer as hosted_listings_count,
      min(l.created_at) as first_hosting_at
    from public.listings l
    cross join viewer v
    where l.owner_id = p_user_id
      and (l.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
  ),
  booking_stats as (
    select count(*)::integer as booked_reservations_count
    from public.reservations r
    where r.renter_id = p_user_id
  ),
  review_stats as (
    select
      count(*)::integer as review_count,
      coalesce(round(avg(rr.rating), 1), 0)::numeric(2,1) as average_rating,
      count(*) filter (where rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role)::integer as guest_reviews_count,
      count(*) filter (where rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role)::integer as host_reviews_count
    from public.reservation_reviews rr
    join public.listings l on l.id = rr.listing_id
    cross join viewer v
    where rr.reviewee_user_id = p_user_id
      and public.current_user_can_view_user(rr.reviewer_user_id)
      and public.current_user_can_view_user(l.owner_id)
      and (rr.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
      and (l.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
  ),
  review_rows as (
    select
      rr.id,
      rr.reviewer_user_id,
      rr.reviewer_role,
      rr.rating,
      rr.text,
      rr.created_at,
      rr.listing_id,
      l.title as listing_title,
      coalesce(nullif(trim(concat_ws(' ', reviewer.first_name, reviewer.last_name)), ''), 'User') as reviewer_name
    from public.reservation_reviews rr
    join public.listings l on l.id = rr.listing_id
    left join public."user" reviewer on reviewer.id = rr.reviewer_user_id
    cross join viewer v
    where rr.reviewee_user_id = p_user_id
      and public.current_user_can_view_user(rr.reviewer_user_id)
      and public.current_user_can_view_user(l.owner_id)
      and (rr.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
      and (l.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
    order by rr.created_at desc
    limit greatest(coalesce(p_limit, 12), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'id', pu.id,
    'first_name', pu.first_name,
    'last_name', pu.last_name,
    'member_since', pu.inserted_at,
    'profile_role', case
      when coalesce(hs.hosted_listings_count, 0) > 0 and coalesce(bs.booked_reservations_count, 0) > 0 then 'Host & Booker'
      when coalesce(hs.hosted_listings_count, 0) > 0 then 'Host'
      else 'Booker'
    end,
    'years_hosting', case
      when hs.first_hosting_at is null then null
      else greatest(
        extract(year from age(now(), hs.first_hosting_at))::integer,
        0
      )
    end,
    'id_verified', pu.id_verified_at is not null,
    'review_count', coalesce(rs.review_count, 0),
    'average_rating', coalesce(rs.average_rating, 0),
    'guest_reviews_count', coalesce(rs.guest_reviews_count, 0),
    'host_reviews_count', coalesce(rs.host_reviews_count, 0),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'reviewer_user_id', rr.reviewer_user_id,
        'reviewer_name', rr.reviewer_name,
        'reviewer_role', rr.reviewer_role,
        'rating', rr.rating,
        'text', rr.text,
        'created_at', rr.created_at,
        'listing_id', rr.listing_id,
        'listing_title', rr.listing_title
      ) order by rr.created_at desc)
      from review_rows rr
    ), '[]'::jsonb)
  )
  from profile_user pu
  left join hosting_stats hs on true
  left join booking_stats bs on true
  left join review_stats rs on true;
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
  v_can_view_deleted boolean := public.current_user_can_view_deleted_rows();
begin
  select *
  into result
  from public.listings l
  where l.id = p_id
    and public.current_user_can_view_user(l.owner_id)
    and (l.status = 'ACTIVE'::public.record_status or v_can_view_deleted)
    and (
      l.moderation_status = 'APPROVED'::public.listing_moderation_status
      or l.owner_id = v_uid
      or public.current_user_can_moderate_listings()
    );

  if result.id is null then
    raise exception 'Listing not found';
  end if;

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
declare
  v_can_view_deleted boolean := public.current_user_can_view_deleted_rows();
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
    and public.current_user_can_view_user(l.owner_id)
    and (l.status = 'ACTIVE'::public.record_status or v_can_view_deleted)
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
  v_can_view_deleted boolean := public.current_user_can_view_deleted_rows();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select to_jsonb(l)
  from public.listings l
  where l.owner_id = v_uid
    and (l.status = 'ACTIVE'::public.record_status or v_can_view_deleted)
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
    'status', l.status,
    'owner_name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Host'),
    'owner_email', u.email
  )
  from public.listings l
  left join public."user" u on u.id = l.owner_id
  where l.moderation_status = 'PENDING_APPROVAL'::public.listing_moderation_status
    and l.status = 'ACTIVE'::public.record_status
  order by l.submitted_at asc, l.created_at asc;
end;
$function$;

create or replace function public.delete_listing(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid        uuid := auth.uid();
  v_deleted_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.listings
  set status = 'DELETED'::public.record_status
  where id = p_id
    and owner_id = v_uid
    and status <> 'DELETED'::public.record_status
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$function$;

create or replace function public.list_pending_reservation_reviews()
returns setof jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  with eligible as (
    select
      r.id as reservation_id,
      r.listing_id,
      r.start_at,
      r.end_at,
      case
        when r.renter_id = v_uid then 'BOOKER_TO_HOST'::public.reservation_review_role
        else 'HOST_TO_BOOKER'::public.reservation_review_role
      end as reviewer_role,
      case
        when r.renter_id = v_uid then l.owner_id
        else r.renter_id
      end as reviewee_user_id,
      case
        when r.renter_id = v_uid then coalesce(nullif(trim(concat_ws(' ', owner_user.first_name, owner_user.last_name)), ''), 'Host')
        else coalesce(nullif(trim(concat_ws(' ', renter_user.first_name, renter_user.last_name)), ''), 'Guest')
      end as reviewee_display_name,
      r.end_at + interval '14 days' as expires_at
    from public.reservations r
    join public.listings l on l.id = r.listing_id
    left join public."user" owner_user on owner_user.id = l.owner_id
    left join public."user" renter_user on renter_user.id = r.renter_id
    where r.status = 'CONFIRMED'::public.reservation_status
      and r.end_at <= now()
      and r.end_at > now() - interval '14 days'
      and l.status = 'ACTIVE'::public.record_status
      and (r.renter_id = v_uid or l.owner_id = v_uid)
  )
  select jsonb_build_object(
    'reservation_id', e.reservation_id,
    'listing_id', e.listing_id,
    'reviewer_role', e.reviewer_role,
    'reviewee_user_id', e.reviewee_user_id,
    'reviewee_display_name', e.reviewee_display_name,
    'start_at', e.start_at,
    'end_at', e.end_at,
    'expires_at', e.expires_at
  )
  from eligible e
  where e.reviewee_user_id is not null
    and e.reviewee_user_id <> v_uid
    and public.current_user_can_view_user(e.reviewee_user_id)
    and not exists (
      select 1
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.reservation_id = e.reservation_id
        and rr.reviewer_role = e.reviewer_role
        and rr.status = 'ACTIVE'::public.record_status
    )
    and not exists (
      select 1
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.status = 'ACTIVE'::public.record_status
        and (
          (e.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
            and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
            and rr.listing_id = e.listing_id)
          or
          (e.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
            and rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
            and rr.reviewee_user_id = e.reviewee_user_id)
        )
    )
  order by e.end_at desc;
end;
$function$;

create or replace function public.create_reservation_review(
  p_reservation_id uuid,
  p_rating numeric,
  p_text text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_reservation public.reservations%rowtype;
  v_listing public.listings%rowtype;
  v_reviewer_role public.reservation_review_role;
  v_reviewee_user_id uuid;
  v_result public.reservation_reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if btrim(coalesce(p_text, '')) = '' then
    raise exception 'Review text is required';
  end if;

  select *
  into v_reservation
  from public.reservations r
  where r.id = p_reservation_id;

  if v_reservation.id is null then
    raise exception 'Reservation not found';
  end if;

  select *
  into v_listing
  from public.listings l
  where l.id = v_reservation.listing_id
    and l.status = 'ACTIVE'::public.record_status;

  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  if v_reservation.status <> 'CONFIRMED'::public.reservation_status then
    raise exception 'Only confirmed reservations can be reviewed';
  end if;

  if v_reservation.end_at > now() then
    raise exception 'Reservation must be completed before leaving a review';
  end if;

  if v_reservation.end_at <= now() - interval '14 days' then
    raise exception 'Review window has expired';
  end if;

  if v_reservation.renter_id = v_uid then
    v_reviewer_role := 'BOOKER_TO_HOST'::public.reservation_review_role;
    v_reviewee_user_id := v_listing.owner_id;
  elsif v_listing.owner_id = v_uid then
    v_reviewer_role := 'HOST_TO_BOOKER'::public.reservation_review_role;
    v_reviewee_user_id := v_reservation.renter_id;
  else
    raise exception 'Only reservation participants can leave a review';
  end if;

  if v_reviewee_user_id is null or v_reviewee_user_id = v_uid then
    raise exception 'Cannot review yourself';
  end if;

  if exists (
    select 1
    from public.reservation_reviews rr
    where rr.reviewer_user_id = v_uid
      and rr.status = 'ACTIVE'::public.record_status
      and (
        (v_reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
          and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
          and rr.listing_id = v_reservation.listing_id)
        or
        (v_reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
          and rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
          and rr.reviewee_user_id = v_reviewee_user_id)
      )
  ) then
    if v_reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role then
      raise exception 'You have already submitted a review for this listing';
    end if;

    raise exception 'You have already submitted a review for this guest';
  end if;

  insert into public.reservation_reviews (
    reservation_id,
    listing_id,
    reviewer_user_id,
    reviewee_user_id,
    reviewer_role,
    rating,
    text,
    status
  ) values (
    p_reservation_id,
    v_reservation.listing_id,
    v_uid,
    v_reviewee_user_id,
    v_reviewer_role,
    p_rating,
    btrim(p_text),
    'ACTIVE'::public.record_status
  )
  returning * into v_result;

  return to_jsonb(v_result);
end;
$function$;

create or replace function public.refresh_listing_review_stats(
  p_listing_id uuid default null
) returns void
language plpgsql
set search_path to ''
as $function$
begin
  update public.listings l
  set
    rating_sum = coalesce((
      select sum(rr.rating)::numeric
      from public.reservation_reviews rr
      where rr.listing_id = l.id
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
        and rr.status = 'ACTIVE'::public.record_status
    ), 0),
    review_count = (
      select count(*)::integer
      from public.reservation_reviews rr
      where rr.listing_id = l.id
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
        and rr.status = 'ACTIVE'::public.record_status
    ),
    average_rating = coalesce((
      select round(avg(rr.rating), 1)::numeric(2,1)
      from public.reservation_reviews rr
      where rr.listing_id = l.id
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
        and rr.status = 'ACTIVE'::public.record_status
    ), 0)
  where p_listing_id is null or l.id = p_listing_id;
end;
$function$;

drop function if exists public.list_reviews(uuid, integer, integer);
create or replace function public.list_reviews(
  p_listing_id uuid,
  p_limit integer default 6,
  p_offset integer default 0
) returns setof jsonb
language sql
security definer
set search_path to ''
as $function$
  with viewer as (
    select public.current_user_can_view_deleted_rows() as can_view_deleted
  )
  select jsonb_build_object(
    'id', rr.id,
    'reservation_id', rr.reservation_id,
    'listing_id', rr.listing_id,
    'user_id', rr.reviewer_user_id,
    'rating', rr.rating,
    'text', rr.text,
    'created_at', rr.created_at,
    'updated_at', rr.updated_at,
    'author_name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Guest')
  )
  from public.reservation_reviews rr
  join public.listings l on l.id = rr.listing_id
  left join public."user" u on u.id = rr.reviewer_user_id
  cross join viewer v
  where rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    and public.current_user_can_view_user(rr.reviewer_user_id)
    and public.current_user_can_view_user(l.owner_id)
    and (rr.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
    and (l.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
    and (p_listing_id is null or rr.listing_id = p_listing_id)
  order by rr.created_at desc
  limit p_limit offset p_offset;
$function$;

create or replace function public.get_review(p_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  with viewer as (
    select public.current_user_can_view_deleted_rows() as can_view_deleted
  )
  select jsonb_build_object(
    'id', rr.id,
    'reservation_id', rr.reservation_id,
    'listing_id', rr.listing_id,
    'user_id', rr.reviewer_user_id,
    'rating', rr.rating,
    'text', rr.text,
    'created_at', rr.created_at,
    'updated_at', rr.updated_at,
    'author_name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Guest')
  )
  from public.reservation_reviews rr
  join public.listings l on l.id = rr.listing_id
  left join public."user" u on u.id = rr.reviewer_user_id
  cross join viewer v
  where rr.id = p_id
    and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    and public.current_user_can_view_user(rr.reviewer_user_id)
    and public.current_user_can_view_user(l.owner_id)
    and (rr.status = 'ACTIVE'::public.record_status or v.can_view_deleted)
    and (l.status = 'ACTIVE'::public.record_status or v.can_view_deleted);
$function$;

create or replace function public.update_reservation_review(
  p_review_id uuid,
  p_rating numeric default null,
  p_text text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result public.reservation_reviews%rowtype;
  v_reservation public.reservations%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if p_text is not null and btrim(p_text) = '' then
    raise exception 'Review text is required';
  end if;

  select *
  into v_result
  from public.reservation_reviews rr
  where rr.id = p_review_id
    and rr.status = 'ACTIVE'::public.record_status;

  if v_result.id is null then
    raise exception 'Review not found';
  end if;

  if v_result.reviewer_user_id <> v_uid then
    raise exception 'Only the review author can update this review';
  end if;

  select *
  into v_reservation
  from public.reservations r
  where r.id = v_result.reservation_id;

  if v_reservation.id is null then
    raise exception 'Reservation not found';
  end if;

  if v_reservation.status <> 'CONFIRMED'::public.reservation_status then
    raise exception 'Only confirmed reservations can be reviewed';
  end if;

  if v_reservation.end_at > now() then
    raise exception 'Reservation must be completed before editing a review';
  end if;

  if v_reservation.end_at <= now() - interval '14 days' then
    raise exception 'Review window has expired';
  end if;

  update public.reservation_reviews
  set
    rating = coalesce(p_rating, rating),
    text = coalesce(case when p_text is null then null else btrim(p_text) end, text)
  where id = p_review_id
    and reviewer_user_id = v_uid
    and status = 'ACTIVE'::public.record_status
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Review not found';
  end if;

  return to_jsonb(v_result);
end;
$function$;

create or replace function public.create_direct_chat(target_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  chat_row public.chats%rowtype;
  client_user_id uuid := auth.uid()::uuid;
  v_can_view_deleted boolean := public.current_user_can_view_deleted_rows();
begin
  if client_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or not public.current_user_can_view_user(target_user_id) then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  if p_listing_id is null then
    raise exception 'Listing id is required';
  end if;

  if not exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and public.current_user_can_view_user(l.owner_id)
      and (l.status = 'ACTIVE'::public.record_status or v_can_view_deleted)
      and (
        l.moderation_status = 'APPROVED'::public.listing_moderation_status
        or l.owner_id = client_user_id
        or public.current_user_can_moderate_listings()
      )
  ) then
    raise exception 'Listing not found';
  end if;

  with visible_direct_chats as (
    select
      c.id,
      count(*)::integer as participant_count,
      bool_and(public.current_user_can_view_user(cp.participant_id)) as participants_visible
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.chat_type = 'DIRECT'::public.chat_type
      and c.listing_id = p_listing_id
      and c.status = 'ACTIVE'::public.record_status
    group by c.id
  )
  select c.*
  into chat_row
  from public.chats c
  join visible_direct_chats vdc on vdc.id = c.id
  join public.chat_participants cp1
    on cp1.chat_id = c.id and cp1.participant_id = client_user_id
  join public.chat_participants cp2
    on cp2.chat_id = c.id and cp2.participant_id = target_user_id
  where vdc.participant_count = 2
    and coalesce(vdc.participants_visible, false)
  order by c.id
  limit 1;

  if found then
    return jsonb_build_object(
      'id', chat_row.id,
      'chat_type', chat_row.chat_type,
      'metadata', chat_row.metadata,
      'listing_id', chat_row.listing_id,
      'status', chat_row.status,
      'participants', (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name
          )
          order by cp.participant_id::text
        )
        from public.chat_participants cp
        join public."user" u on u.id = cp.participant_id
        where cp.chat_id = chat_row.id
      ),
      'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
      'updated_at', (
        select max(cm.created_at)
        from public.chat_messages cm
        where cm.chat_id = chat_row.id
          and cm.status = 'ACTIVE'::public.record_status
      )
    );
  end if;

  insert into public.chats (chat_type, metadata, listing_id, status)
  values ('DIRECT'::public.chat_type, '{}'::jsonb, p_listing_id, 'ACTIVE'::public.record_status)
  returning * into chat_row;

  insert into public.chat_participants (chat_id, participant_id, metadata)
  select chat_row.id, participant_id, '{}'::jsonb
  from (
    select distinct unnest(array[client_user_id, target_user_id]) as participant_id
  ) participants;

  return jsonb_build_object(
    'id', chat_row.id,
    'chat_type', chat_row.chat_type,
    'metadata', chat_row.metadata,
    'listing_id', chat_row.listing_id,
    'status', chat_row.status,
    'participants', (
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name
        )
        order by cp.participant_id::text
      )
      from public.chat_participants cp
      join public."user" u on u.id = cp.participant_id
      where cp.chat_id = chat_row.id
    ),
    'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
    'updated_at', null
  );
end;
$function$;

create or replace function public.get_client_chats()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid()::uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return coalesce((
    with visible_chats as (
      select
        c.id,
        c.chat_type,
        c.metadata,
        c.listing_id,
        c.status,
        max(cm.created_at) as updated_at,
        bool_and(public.current_user_can_view_user(cp_all.participant_id)) as participants_visible
      from public.chats c
      join public.chat_participants cp_viewer
        on cp_viewer.chat_id = c.id and cp_viewer.participant_id = v_uid
      join public.chat_participants cp_all on cp_all.chat_id = c.id
      left join public.chat_messages cm
        on cm.chat_id = c.id
       and cm.status = 'ACTIVE'::public.record_status
      where c.status = 'ACTIVE'::public.record_status
      group by c.id, c.chat_type, c.metadata, c.listing_id, c.status
    )
    select jsonb_agg(
      jsonb_build_object(
        'id', vc.id,
        'chat_type', vc.chat_type,
        'metadata', vc.metadata,
        'listing_id', vc.listing_id,
        'status', vc.status,
        'participants', (
          select jsonb_agg(
            jsonb_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name
            )
            order by cp2.participant_id::text
          )
          from public.chat_participants cp2
          join public."user" u on u.id = cp2.participant_id
          where cp2.chat_id = vc.id
        ),
        'participant_ids', (
          select jsonb_agg(cp2.participant_id::text order by cp2.participant_id::text)
          from public.chat_participants cp2
          where cp2.chat_id = vc.id
        ),
        'updated_at', vc.updated_at
      )
      order by vc.updated_at desc nulls last, vc.id desc
    )
    from visible_chats vc
    where coalesce(vc.participants_visible, false)
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.get_direct_chat_by_user_id(target_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  client_user_id uuid := auth.uid()::uuid;
begin
  if client_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or not public.current_user_can_view_user(target_user_id) then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  if p_listing_id is null then
    raise exception 'Listing id is required';
  end if;

  return (
    with visible_direct_chats as (
      select
        c.id,
        count(*)::integer as participant_count,
        bool_and(public.current_user_can_view_user(cp.participant_id)) as participants_visible
      from public.chats c
      join public.chat_participants cp on cp.chat_id = c.id
      where c.chat_type = 'DIRECT'::public.chat_type
        and c.listing_id = p_listing_id
        and c.status = 'ACTIVE'::public.record_status
      group by c.id
    )
    select jsonb_build_object(
      'id', c.id,
      'chat_type', c.chat_type,
      'metadata', c.metadata,
      'listing_id', c.listing_id,
      'status', c.status,
      'participants', (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name
          )
          order by cp.participant_id::text
        )
        from public.chat_participants cp
        join public."user" u on u.id = cp.participant_id
        where cp.chat_id = c.id
      ),
      'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
      'updated_at', (
        select max(cm.created_at)
        from public.chat_messages cm
        where cm.chat_id = c.id
          and cm.status = 'ACTIVE'::public.record_status
      )
    )
    from public.chats c
    join visible_direct_chats vdc on vdc.id = c.id
    join public.chat_participants cp1
      on cp1.chat_id = c.id and cp1.participant_id = client_user_id
    join public.chat_participants cp2
      on cp2.chat_id = c.id and cp2.participant_id = target_user_id
    where vdc.participant_count = 2
      and coalesce(vdc.participants_visible, false)
    order by c.id
    limit 1
  );
end;
$function$;

create or replace function public.create_message(p_chat_id uuid, p_contents text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_uid uuid := auth.uid()::uuid;
  v_chat_is_visible boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_contents is null or p_contents = '' then
    raise exception 'Can''t create an empty message';
  end if;

  select exists (
    select 1
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.id = p_chat_id
      and cp.participant_id = v_uid
      and c.status = 'ACTIVE'::public.record_status
      and not exists (
        select 1
        from public.chat_participants cp_hidden
        where cp_hidden.chat_id = c.id
          and not public.current_user_can_view_user(cp_hidden.participant_id)
      )
  ) into v_chat_is_visible;

  if not v_chat_is_visible then
    raise exception 'Chat not found';
  end if;

  insert into public.chat_messages (sender_id, chat_id, contents, status)
  values (v_uid, p_chat_id, p_contents, 'ACTIVE'::public.record_status)
  returning jsonb_build_object(
    'id', id,
    'sender_id', sender_id,
    'chat_id', chat_id,
    'contents', contents,
    'created_at', created_at,
    'status', status
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.delete_messages(msg_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid()::uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.chat_messages cm
  set status = 'DELETED'::public.record_status
  where cm.id = any (msg_ids)
    and cm.status <> 'DELETED'::public.record_status
    and exists (
      select 1
      from public.chats c
      join public.chat_participants cp on cp.chat_id = c.id
      where c.id = cm.chat_id
        and cp.participant_id = v_uid
        and c.status = 'ACTIVE'::public.record_status
        and not exists (
          select 1
          from public.chat_participants cp_hidden
          where cp_hidden.chat_id = c.id
            and not public.current_user_can_view_user(cp_hidden.participant_id)
        )
    );

  return found;
end;
$function$;

create or replace function public.get_messages(p_chat_id uuid, p_cursor integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_messages jsonb;
  v_total_count int;
  v_next_cursor int;
  v_uid uuid := auth.uid()::uuid;
  v_chat_is_visible boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.id = p_chat_id
      and cp.participant_id = v_uid
      and c.status = 'ACTIVE'::public.record_status
      and not exists (
        select 1
        from public.chat_participants cp_hidden
        where cp_hidden.chat_id = c.id
          and not public.current_user_can_view_user(cp_hidden.participant_id)
      )
  ) into v_chat_is_visible;

  if not v_chat_is_visible then
    return jsonb_build_object(
      'messages', '[]'::jsonb,
      'nextCursor', null
    );
  end if;

  select count(*) into v_total_count
  from public.chat_messages cm
  where cm.chat_id = p_chat_id
    and cm.status = 'ACTIVE'::public.record_status;

  if p_cursor + p_limit < v_total_count then
    v_next_cursor := p_cursor + p_limit;
  else
    v_next_cursor := null;
  end if;

  select jsonb_build_object(
    'messages', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'sender_id', m.sender_id,
          'chat_id', m.chat_id,
          'contents', m.contents,
          'created_at', m.created_at,
          'status', m.status
        ) order by m.created_at desc
      ),
      '[]'::jsonb
    ),
    'nextCursor', v_next_cursor
  ) into v_messages
  from (
    select cm.id, cm.sender_id, cm.chat_id, cm.contents, cm.created_at, cm.status
    from public.chat_messages cm
    where cm.chat_id = p_chat_id
      and cm.status = 'ACTIVE'::public.record_status
    order by cm.created_at desc
    offset p_cursor
    limit p_limit
  ) m;

  return v_messages;
end;
$function$;

create or replace function public.delete_chat(
  p_chat_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid()::uuid;
  v_chat_is_visible boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.id = p_chat_id
      and cp.participant_id = v_uid
      and c.status = 'ACTIVE'::public.record_status
      and not exists (
        select 1
        from public.chat_participants cp_hidden
        where cp_hidden.chat_id = c.id
          and not public.current_user_can_view_user(cp_hidden.participant_id)
      )
  ) into v_chat_is_visible;

  if not v_chat_is_visible then
    raise exception 'You are not a participant in this chat';
  end if;

  update public.chat_messages
  set status = 'DELETED'::public.record_status
  where chat_id = p_chat_id
    and status <> 'DELETED'::public.record_status;

  update public.chats c
  set status = 'DELETED'::public.record_status
  where c.id = p_chat_id
    and c.status <> 'DELETED'::public.record_status;

  return found;
end;
$function$;

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_broadcast boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notification public.notifications%rowtype;
begin
  if p_user_id is null then
    raise exception 'Notification user is required';
  end if;

  if btrim(coalesce(p_type, '')) = '' then
    raise exception 'Notification type is required';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Notification title is required';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    payload,
    status
  ) values (
    p_user_id,
    btrim(p_type),
    btrim(p_title),
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_action_url, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb),
    'ACTIVE'::public.record_status
  )
  returning * into v_notification;

  if p_broadcast then
    perform realtime.send(
      to_jsonb(v_notification),
      'notifications_update',
      'notifications:' || p_user_id::text,
      true
    );
  end if;

  return to_jsonb(v_notification);
end;
$function$;

create or replace function public.sync_review_reminder_notifications(
  p_user_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_created_count integer := 0;
  v_prompt record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  with eligible as (
    select
      r.id as reservation_id,
      r.listing_id,
      case
        when r.renter_id = v_uid then 'BOOKER_TO_HOST'::public.reservation_review_role
        else 'HOST_TO_BOOKER'::public.reservation_review_role
      end as reviewer_role,
      case
        when r.renter_id = v_uid then l.owner_id
        else r.renter_id
      end as reviewee_user_id
    from public.reservations r
    join public.listings l on l.id = r.listing_id
    where r.status = 'CONFIRMED'::public.reservation_status
      and r.end_at <= now()
      and r.end_at > now() - interval '14 days'
      and l.status = 'ACTIVE'::public.record_status
      and (r.renter_id = v_uid or l.owner_id = v_uid)
  )
  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = v_uid
    and n.type = 'review_reminder'
    and n.entity_type = 'reservation'
    and n.status = 'ACTIVE'::public.record_status
    and not n.is_read
    and not exists (
      select 1
      from eligible e
      where e.reservation_id::text = n.entity_id
        and e.reviewee_user_id is not null
        and e.reviewee_user_id <> v_uid
        and public.current_user_can_view_user(e.reviewee_user_id)
        and e.reviewer_role::text = coalesce(n.payload ->> 'reviewer_role', '')
        and not exists (
          select 1
          from public.reservation_reviews rr
          where rr.reviewer_user_id = v_uid
            and rr.reservation_id = e.reservation_id
            and rr.reviewer_role = e.reviewer_role
            and rr.status = 'ACTIVE'::public.record_status
        )
        and not exists (
          select 1
          from public.reservation_reviews rr
          where rr.reviewer_user_id = v_uid
            and rr.status = 'ACTIVE'::public.record_status
            and (
              (e.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
                and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
                and rr.listing_id = e.listing_id)
              or
              (e.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
                and rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
                and rr.reviewee_user_id = e.reviewee_user_id)
            )
        )
    );

  for v_prompt in
    with eligible as (
      select
        r.id as reservation_id,
        r.listing_id,
        l.title as listing_title,
        r.start_at,
        r.end_at,
        case
          when r.renter_id = v_uid then 'BOOKER_TO_HOST'::public.reservation_review_role
          else 'HOST_TO_BOOKER'::public.reservation_review_role
        end as reviewer_role,
        case
          when r.renter_id = v_uid then l.owner_id
          else r.renter_id
        end as reviewee_user_id,
        case
          when r.renter_id = v_uid then coalesce(nullif(trim(concat_ws(' ', owner_user.first_name, owner_user.last_name)), ''), 'Host')
          else coalesce(nullif(trim(concat_ws(' ', renter_user.first_name, renter_user.last_name)), ''), 'Guest')
        end as reviewee_display_name,
        r.end_at + interval '14 days' as expires_at
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      left join public."user" owner_user on owner_user.id = l.owner_id
      left join public."user" renter_user on renter_user.id = r.renter_id
      where r.status = 'CONFIRMED'::public.reservation_status
        and r.end_at <= now()
        and r.end_at > now() - interval '14 days'
        and l.status = 'ACTIVE'::public.record_status
        and (r.renter_id = v_uid or l.owner_id = v_uid)
    )
    select
      e.reservation_id,
      e.listing_id,
      e.listing_title,
      e.reviewer_role,
      e.reviewee_user_id,
      e.reviewee_display_name,
      e.expires_at
    from eligible e
    where e.reviewee_user_id is not null
      and e.reviewee_user_id <> v_uid
      and public.current_user_can_view_user(e.reviewee_user_id)
      and not exists (
        select 1
        from public.reservation_reviews rr
        where rr.reviewer_user_id = v_uid
          and rr.reservation_id = e.reservation_id
          and rr.reviewer_role = e.reviewer_role
          and rr.status = 'ACTIVE'::public.record_status
      )
      and not exists (
        select 1
        from public.reservation_reviews rr
        where rr.reviewer_user_id = v_uid
          and rr.status = 'ACTIVE'::public.record_status
          and (
            (e.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
              and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
              and rr.listing_id = e.listing_id)
            or
            (e.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
              and rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
              and rr.reviewee_user_id = e.reviewee_user_id)
          )
      )
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = v_uid
          and n.type = 'review_reminder'
          and n.entity_type = 'reservation'
          and n.entity_id = e.reservation_id::text
          and n.status = 'ACTIVE'::public.record_status
      )
    order by e.end_at desc
  loop
    begin
      perform public.create_notification(
        v_uid,
        'review_reminder',
        case
          when v_prompt.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role then 'Leave a review for your guest'
          else 'Leave a review for your host'
        end,
        case
          when v_prompt.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role then
            format('Your session for %s has ended. Share feedback for %s.', coalesce(v_prompt.listing_title, 'this listing'), v_prompt.reviewee_display_name)
          else
            format('Your reservation for %s has ended. Share feedback for %s.', coalesce(v_prompt.listing_title, 'this listing'), v_prompt.reviewee_display_name)
        end,
        '/reservation/' || v_prompt.reservation_id::text || '?leaveReview=1',
        'reservation',
        v_prompt.reservation_id::text,
        jsonb_build_object(
          'reservation_id', v_prompt.reservation_id,
          'listing_id', v_prompt.listing_id,
          'reviewer_role', v_prompt.reviewer_role,
          'reviewee_user_id', v_prompt.reviewee_user_id,
          'reviewee_display_name', v_prompt.reviewee_display_name,
          'expires_at', v_prompt.expires_at
        )
      );

      v_created_count := v_created_count + 1;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return v_created_count;
end;
$function$;

create or replace function public.list_notifications(
  p_limit integer default 20,
  p_offset integer default 0
) returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_can_view_deleted boolean := public.current_user_can_view_deleted_rows();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_review_reminder_notifications(v_uid);

  return query
  select to_jsonb(n)
  from public.notifications n
  where n.user_id = v_uid
    and (n.status = 'ACTIVE'::public.record_status or v_can_view_deleted)
  order by n.created_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

create or replace function public.count_unread_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_review_reminder_notifications(v_uid);

  select count(*)::integer
  into v_count
  from public.notifications n
  where n.user_id = v_uid
    and n.status = 'ACTIVE'::public.record_status
    and not n.is_read;

  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.mark_notification_read(
  p_notification_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_notification public.notifications%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.user_id = v_uid
    and n.status = 'ACTIVE'::public.record_status
  returning * into v_notification;

  if v_notification.id is null then
    raise exception 'Notification not found';
  end if;

  return to_jsonb(v_notification);
end;
$function$;

-- RLS visibility aligned with status-based soft delete.
drop policy if exists "listings_public_select" on public.listings;
create policy "listings_public_select" on public.listings
  for select
  using (
    public.current_user_can_view_user(owner_id)
    and (
      status = 'ACTIVE'::public.record_status
      or public.current_user_can_view_deleted_rows()
    )
  );

drop policy if exists reservation_reviews_select_participants on public.reservation_reviews;
create policy reservation_reviews_select_participants
  on public.reservation_reviews
  for select
  to authenticated
  using (
    (reviewer_user_id = auth.uid() or reviewee_user_id = auth.uid())
    and (
      status = 'ACTIVE'::public.record_status
      or public.current_user_can_view_deleted_rows()
    )
  );

drop policy if exists reservation_reviews_update_reviewer on public.reservation_reviews;
create policy reservation_reviews_update_reviewer
  on public.reservation_reviews
  for update
  to authenticated
  using (
    reviewer_user_id = auth.uid()
    and status = 'ACTIVE'::public.record_status
  )
  with check (
    reviewer_user_id = auth.uid()
    and status = 'ACTIVE'::public.record_status
    and exists (
      select 1
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      where r.id = reservation_reviews.reservation_id
        and r.listing_id = reservation_reviews.listing_id
        and r.status = 'CONFIRMED'::public.reservation_status
        and l.status = 'ACTIVE'::public.record_status
        and (
          (
            reservation_reviews.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
            and r.renter_id = auth.uid()
            and l.owner_id = reservation_reviews.reviewee_user_id
          )
          or
          (
            reservation_reviews.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
            and l.owner_id = auth.uid()
            and r.renter_id = reservation_reviews.reviewee_user_id
          )
        )
    )
  );

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (
      status = 'ACTIVE'::public.record_status
      or public.current_user_can_view_deleted_rows()
    )
  );

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and status = 'ACTIVE'::public.record_status
  )
  with check (
    user_id = auth.uid()
    and status = 'ACTIVE'::public.record_status
  );

drop policy if exists chat_select on public.chats;
create policy chat_select on public.chats for select to authenticated using (
  (
    status = 'ACTIVE'::public.record_status
    or public.current_user_can_view_deleted_rows()
  )
  and id in (
    select cp.chat_id
    from public.chat_participants cp
    where cp.participant_id = auth.uid()
  )
  and not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = chats.id
      and not public.current_user_can_view_user(cp.participant_id)
  )
);

drop policy if exists get_messages on public.chat_messages;
create policy get_messages on public.chat_messages for select to authenticated using (
  (
    status = 'ACTIVE'::public.record_status
    or public.current_user_can_view_deleted_rows()
  )
  and chat_id in (
    select cp.chat_id
    from public.chat_participants cp
    where cp.participant_id = auth.uid()
  )
);
