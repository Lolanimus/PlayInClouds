create or replace function public.current_user_can_view_deleted_rows()
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select public.current_user_is_admin();
$function$;

revoke all on function public.current_user_can_view_deleted_rows() from public, anon;
grant execute on function public.current_user_can_view_deleted_rows() to authenticated, anon, service_role;

create or replace function public.current_user_can_view_user(
  p_user_id uuid
) returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public."user" u
    where u.id = p_user_id
      and (
        u.account_status <> 'DELETED'::public.account_status
        or public.current_user_can_view_deleted_rows()
      )
  );
$function$;

revoke all on function public.current_user_can_view_user(uuid) from public, anon;
grant execute on function public.current_user_can_view_user(uuid) to authenticated, anon, service_role;

create or replace function public.get_public_profile(
  p_user_id uuid,
  p_limit integer default 12,
  p_offset integer default 0
) returns jsonb
language sql
security definer
set search_path to ''
as $function$
  with profile_user as (
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
    where l.owner_id = p_user_id
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
    where rr.reviewee_user_id = p_user_id
      and public.current_user_can_view_user(rr.reviewer_user_id)
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
    left join public.listings l on l.id = rr.listing_id
    left join public."user" reviewer on reviewer.id = rr.reviewer_user_id
    where rr.reviewee_user_id = p_user_id
      and public.current_user_can_view_user(rr.reviewer_user_id)
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
begin
  select *
  into result
  from public.listings l
  where l.id = p_id
    and public.current_user_can_view_user(l.owner_id)
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
    and (p_address is null or l.address = p_address)
    and (p_category is null or l.category = p_category)
    and (p_min_price is null or l.price >= p_min_price)
    and (p_max_price is null or l.price <= p_max_price)
  order by l.created_at desc
  limit p_limit offset p_offset;
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
  where rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    and public.current_user_can_view_user(rr.reviewer_user_id)
    and public.current_user_can_view_user(l.owner_id)
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
  where rr.id = p_id
    and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    and public.current_user_can_view_user(rr.reviewer_user_id)
    and public.current_user_can_view_user(l.owner_id);
$function$;