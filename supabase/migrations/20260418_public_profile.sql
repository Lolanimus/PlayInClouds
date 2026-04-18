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

grant execute on function public.get_public_profile(uuid, integer, integer) to authenticated, anon, service_role;
