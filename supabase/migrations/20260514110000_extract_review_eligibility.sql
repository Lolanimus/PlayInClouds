create or replace function public.can_leave_review(
  p_user_id uuid,
  p_reservation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_listing_owner_id uuid;
  v_reviewer_role public.reservation_review_role;
  v_reviewee_user_id uuid;
begin
  if p_user_id is null or p_reservation_id is null then
    return false;
  end if;

  select *
  into v_reservation
  from public.reservations r
  where r.id = p_reservation_id;

  if v_reservation.id is null then
    return false;
  end if;

  select l.owner_id
  into v_listing_owner_id
  from public.listings l
  where l.id = v_reservation.listing_id;

  if v_listing_owner_id is null then
    return false;
  end if;

  if v_reservation.status <> 'CONFIRMED'::public.reservation_status then
    return false;
  end if;

  if v_reservation.end_at > now() then
    return false;
  end if;

  if v_reservation.end_at <= now() - interval '14 days' then
    return false;
  end if;

  if v_reservation.renter_id = p_user_id then
    v_reviewer_role := 'BOOKER_TO_HOST'::public.reservation_review_role;
    v_reviewee_user_id := v_listing_owner_id;
  elsif v_listing_owner_id = p_user_id then
    v_reviewer_role := 'HOST_TO_BOOKER'::public.reservation_review_role;
    v_reviewee_user_id := v_reservation.renter_id;
  else
    return false;
  end if;

  if v_reviewee_user_id is null or v_reviewee_user_id = p_user_id then
    return false;
  end if;

  if exists (
    select 1
    from public.reservation_reviews rr
    where rr.reviewer_user_id = p_user_id
      and rr.reservation_id = p_reservation_id
      and rr.reviewer_role = v_reviewer_role
      and rr.status = 'ACTIVE'::public.record_status
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.reservation_reviews rr
    where rr.reviewer_user_id = p_user_id
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
    return false;
  end if;

  return true;
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
    and public.can_leave_review(v_uid, e.reservation_id)
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

  if not public.can_leave_review(v_uid, p_reservation_id) then
    if exists (
      select 1
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.reservation_id = p_reservation_id
        and rr.reviewer_role = v_reviewer_role
        and rr.status = 'ACTIVE'::public.record_status
    ) then
      raise exception 'You have already submitted a review for this reservation';
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

    raise exception 'Review cannot be created for this reservation';
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
        and public.can_leave_review(v_uid, e.reservation_id)
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
      and public.can_leave_review(v_uid, e.reservation_id)
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

grant execute on function public.can_leave_review(uuid, uuid) to authenticated, service_role;
