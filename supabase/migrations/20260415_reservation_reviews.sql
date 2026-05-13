do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'reservation_review_role'
      and n.nspname = 'public'
  ) then
    create type public.reservation_review_role as enum ('BOOKER_TO_HOST', 'HOST_TO_BOOKER');
  end if;
end
$$;

create table if not exists public.reservation_reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  reviewer_user_id uuid not null references public."user"(id) on delete cascade,
  reviewee_user_id uuid not null references public."user"(id) on delete cascade,
  reviewer_role public.reservation_review_role not null,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  text text not null check (char_length(btrim(text)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_reviews_distinct_users check (reviewer_user_id <> reviewee_user_id)
);

delete from public.reservation_reviews rr
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by reservation_id, reviewer_role
        order by updated_at desc, created_at desc, id desc
      ) as rn
    from public.reservation_reviews
  ) ranked
  where ranked.rn > 1
) duplicates
where rr.id = duplicates.id;

delete from public.reservation_reviews rr
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by listing_id, reviewer_user_id
        order by updated_at desc, created_at desc, id desc
      ) as rn
    from public.reservation_reviews
    where reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
  ) ranked
  where ranked.rn > 1
) duplicates
where rr.id = duplicates.id;

delete from public.reservation_reviews rr
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by reviewer_user_id, reviewee_user_id
        order by updated_at desc, created_at desc, id desc
      ) as rn
    from public.reservation_reviews
    where reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
  ) ranked
  where ranked.rn > 1
) duplicates
where rr.id = duplicates.id;

create unique index if not exists reservation_reviews_unique_role_per_reservation
  on public.reservation_reviews(reservation_id, reviewer_role);

create unique index if not exists reservation_reviews_unique_booker_to_host_per_listing
  on public.reservation_reviews(listing_id, reviewer_user_id)
  where reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role;

drop index if exists public.reservation_reviews_unique_host_to_booker_per_listing;

create unique index if not exists reservation_reviews_unique_host_to_booker_per_guest
  on public.reservation_reviews(reviewer_user_id, reviewee_user_id)
  where reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role;

create index if not exists idx_reservation_reviews_reviewer_user_id
  on public.reservation_reviews(reviewer_user_id);

create index if not exists idx_reservation_reviews_reviewee_user_id
  on public.reservation_reviews(reviewee_user_id);

create index if not exists idx_reservation_reviews_listing_id
  on public.reservation_reviews(listing_id);

create index if not exists idx_reservation_reviews_created_at
  on public.reservation_reviews(created_at desc);

drop trigger if exists set_updated_at_reservation_reviews on public.reservation_reviews;
create trigger set_updated_at_reservation_reviews
before update on public.reservation_reviews
for each row execute function public.update_updated_at_column();

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
    and not exists (
    select 1
    from public.reservation_reviews rr
    where rr.reviewer_user_id = v_uid
      and rr.reservation_id = e.reservation_id
      and rr.reviewer_role = e.reviewer_role
  )
    and not exists (
    select 1
    from public.reservation_reviews rr
    where rr.reviewer_user_id = v_uid
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
  where l.id = v_reservation.listing_id;

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
    text
  ) values (
    p_reservation_id,
    v_reservation.listing_id,
    v_uid,
    v_reviewee_user_id,
    v_reviewer_role,
    p_rating,
    btrim(p_text)
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
    ), 0),
    review_count = (
      select count(*)::integer
      from public.reservation_reviews rr
      where rr.listing_id = l.id
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    ),
    average_rating = coalesce((
      select round(avg(rr.rating), 1)::numeric(2,1)
      from public.reservation_reviews rr
      where rr.listing_id = l.id
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    ), 0)
  where p_listing_id is null or l.id = p_listing_id;
end;
$function$;

create or replace function public.sync_listing_review_stats_from_reservation_reviews()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role then
      perform public.refresh_listing_review_stats(new.listing_id);
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role then
      perform public.refresh_listing_review_stats(old.listing_id);
    end if;

    return old;
  end if;

  if old.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role then
    perform public.refresh_listing_review_stats(old.listing_id);
  end if;

  if new.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
     and (old.listing_id is distinct from new.listing_id
       or old.reviewer_role is distinct from new.reviewer_role
       or old.rating is distinct from new.rating) then
    perform public.refresh_listing_review_stats(new.listing_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists sync_listing_review_stats_after_insert on public.reservation_reviews;
create trigger sync_listing_review_stats_after_insert
after insert on public.reservation_reviews
for each row execute function public.sync_listing_review_stats_from_reservation_reviews();

drop trigger if exists sync_listing_review_stats_after_update on public.reservation_reviews;
create trigger sync_listing_review_stats_after_update
after update on public.reservation_reviews
for each row execute function public.sync_listing_review_stats_from_reservation_reviews();

drop trigger if exists sync_listing_review_stats_after_delete on public.reservation_reviews;
create trigger sync_listing_review_stats_after_delete
after delete on public.reservation_reviews
for each row execute function public.sync_listing_review_stats_from_reservation_reviews();

select public.refresh_listing_review_stats();

drop function if exists public.list_reviews(uuid, integer, integer);
create or replace function public.list_reviews(
  p_listing_id uuid,
  p_limit integer default 6,
  p_offset integer default 0
) returns setof jsonb
language sql
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
  left join public."user" u on u.id = rr.reviewer_user_id
  where rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
    and (p_listing_id is null or rr.listing_id = p_listing_id)
  order by rr.created_at desc
  limit p_limit offset p_offset;
$function$;

create or replace function public.get_review(p_id uuid)
returns jsonb
language sql
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
  left join public."user" u on u.id = rr.reviewer_user_id
  where rr.id = p_id
    and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role;
$function$;

drop function if exists public.update_review(uuid, numeric, text);

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
  where rr.id = p_review_id;

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
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Review not found';
  end if;

  return to_jsonb(v_result);
end;
$function$;

create or replace function public.create_review(
  p_listing_id uuid,
  p_user_id uuid,
  p_rating numeric,
  p_text text
) returns jsonb
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'Use create_reservation_review for reservation-backed reviews';
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

alter table public.reservation_reviews enable row level security;

drop policy if exists reservation_reviews_select_participants on public.reservation_reviews;
create policy reservation_reviews_select_participants
  on public.reservation_reviews
  for select
  to authenticated
  using (
    reviewer_user_id = auth.uid()
    or reviewee_user_id = auth.uid()
  );

drop policy if exists reservation_reviews_insert_reviewer on public.reservation_reviews;
create policy reservation_reviews_insert_reviewer
  on public.reservation_reviews
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and reviewer_user_id = auth.uid()
    and exists (
      select 1
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      where r.id = reservation_reviews.reservation_id
        and r.listing_id = reservation_reviews.listing_id
        and r.status = 'CONFIRMED'::public.reservation_status
        and r.end_at <= now()
        and r.end_at > now() - interval '14 days'
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

drop policy if exists reservation_reviews_update_reviewer on public.reservation_reviews;
create policy reservation_reviews_update_reviewer
  on public.reservation_reviews
  for update
  to authenticated
  using (reviewer_user_id = auth.uid())
  with check (
    reviewer_user_id = auth.uid()
    and exists (
      select 1
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      where r.id = reservation_reviews.reservation_id
        and r.listing_id = reservation_reviews.listing_id
        and r.status = 'CONFIRMED'::public.reservation_status
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

drop table if exists public.reviews;

grant execute on function public.list_pending_reservation_reviews() to authenticated, service_role;
grant execute on function public.create_reservation_review(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.update_reservation_review(uuid, numeric, text) to authenticated, service_role;
