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
  v_reviewer_first_name text;
  v_reviewer_last_name text;
  v_reviewee_email text;
  v_reviewee_first_name text;
  v_reviewee_last_name text;
  v_recipient_role text;
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

  select
    reviewer.first_name,
    reviewer.last_name,
    reviewee.email,
    reviewee.first_name,
    reviewee.last_name
  into
    v_reviewer_first_name,
    v_reviewer_last_name,
    v_reviewee_email,
    v_reviewee_first_name,
    v_reviewee_last_name
  from public."user" reviewer
  join public."user" reviewee on reviewee.id = v_reviewee_user_id
  where reviewer.id = v_uid;

  v_recipient_role := case
    when v_reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role then 'host'
    else 'booker'
  end;

  perform public.create_notification(
    v_reviewee_user_id,
    'review_received',
    'New review received',
    case
      when v_reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role then 'A guest left you a review.'
      else 'A host left you a review.'
    end,
    '/profile/' || v_reviewee_user_id::text,
    'review',
    v_result.id::text,
    jsonb_build_object(
      'review_id', v_result.id,
      'reservation_id', v_reservation.id,
      'listing_id', v_reservation.listing_id
    )
  );

  if v_reviewee_email is not null then
    perform public.enqueue_email(
      'review_received',
      v_recipient_role,
      v_reviewee_user_id,
      v_reviewee_email,
      jsonb_build_object(
        'review_id', v_result.id,
        'reservation_id', v_reservation.id,
        'listing_id', v_reservation.listing_id,
        'listing_title', v_listing.title,
        'rating', v_result.rating,
        'reviewer_first_name', v_reviewer_first_name,
        'reviewer_last_name', v_reviewer_last_name,
        'reviewee_first_name', v_reviewee_first_name,
        'reviewee_last_name', v_reviewee_last_name
      ),
      'review-received-' || v_result.id::text
    );
  end if;

  return to_jsonb(v_result);
end;
$function$;
