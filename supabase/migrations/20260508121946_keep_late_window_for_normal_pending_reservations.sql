update public.reservations r
set payment_deadline = public.calculate_reservation_late_booking_deadline(
  r.start_at,
  l.advance_notice_hours
)
from public.listings l
where l.id = r.listing_id
  and r.status in (
    'PENDING'::public.reservation_status,
    'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
  )
  and r.start_at > now()
  and public.calculate_reservation_late_booking_deadline(r.start_at, l.advance_notice_hours) > now();

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
  v_listing_record_status public.record_status;
  v_listing_owner_id uuid;
  v_listing_title text;
  v_cancellation_policy_hours integer;
  v_advance_notice_hours integer;
  v_normal_deadline timestamptz;
  v_payment_deadline timestamptz;
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

  select
    l.owner_id,
    l.moderation_status,
    l.status,
    l.title,
    l.cancellation_policy_hours,
    l.advance_notice_hours
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_listing_title, v_cancellation_policy_hours, v_advance_notice_hours
  from public.listings l
  where l.id = p_listing_id;

  v_normal_deadline := public.calculate_reservation_base_payment_deadline(
    p_start_at,
    v_cancellation_policy_hours
  );
  v_payment_deadline := public.calculate_reservation_late_booking_deadline(
    p_start_at,
    v_advance_notice_hours
  );

  v_listing_exists := found;

  if not v_listing_exists then
    raise exception 'Listing not found';
  end if;
  if v_listing_record_status = 'DELETED'::public.record_status then
    raise exception 'Listing not found';
  end if;
  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;
  if v_listing_owner_id = v_uid then
    raise exception 'You cannot book your own listing';
  end if;
  if v_payment_deadline <= now() then
    raise exception 'This reservation can no longer be booked because the host response deadline has passed';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text));

  if exists (
    select 1 from public.reservations r
    where r.listing_id = p_listing_id
      and r.status in (
        'PENDING'::public.reservation_status,
        'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status,
        'CONFIRMED'::public.reservation_status
      )
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
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
      select count(*)::integer into v_user_past_bookings
      from public.reservations r
      where r.renter_id = v_uid and r.status = 'CONFIRMED' and r.end_at <= now();
      if v_user_past_bookings < v_min_past_bookings then v_rules_passed := false; end if;
    end if;

    if v_rules_passed and v_min_reviews is not null then
      select count(*)::integer into v_user_reviews
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role;
      if v_user_reviews < v_min_reviews then v_rules_passed := false; end if;
    end if;

    if v_rules_passed and v_require_id_verified then
      select (u.id_verified_at is not null) into v_user_id_verified
      from public."user" u
      where u.id = v_uid;
      if coalesce(v_user_id_verified, false) = false then v_rules_passed := false; end if;
    end if;
  end if;

  insert into public.reservations (
    listing_id, renter_id, start_at, end_at, guests, status, payment_deadline, late_consent_given_at, host_preconfirmed_at
  ) values (
    p_listing_id,
    v_uid,
    p_start_at,
    p_end_at,
    p_guests,
    'PENDING'::public.reservation_status,
    v_payment_deadline,
    case when now() > v_normal_deadline then now() else null end,
    null
  ) returning * into result;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_uid then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      case when now() > v_normal_deadline then 'New late reservation request' else 'New reservation request' end,
      format(
        '%s has a new%s reservation request. Confirm it by %s.',
        coalesce(v_listing_title, 'Your listing'),
        case when now() > v_normal_deadline then ' late' else '' end,
        to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
      ),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', p_listing_id, 'payment_deadline', result.payment_deadline, 'is_late', now() > v_normal_deadline)
    );
  end if;

  if v_instant_booking and v_rules_passed then
    select * into result
    from public.confirm_reservation_internal(result.id, false);
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

create or replace function public.create_reservation_from_checkout_hold(
  p_hold_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hold public.checkout_holds%rowtype;
  v_listing_owner_id uuid;
  v_listing_status public.listing_moderation_status;
  v_listing_record_status public.record_status;
  v_listing_title text;
  v_cancellation_policy_hours integer;
  v_advance_notice_hours integer;
  v_normal_deadline timestamptz;
  v_payment_deadline timestamptz;
  result public.reservations%rowtype;
begin
  select * into v_hold from public.checkout_holds h where h.id = p_hold_id;
  if v_hold.id is null then raise exception 'Checkout hold not found'; end if;
  if v_hold.status <> 'OPEN'::public.checkout_hold_status then raise exception 'Checkout hold is no longer open'; end if;
  if v_hold.expires_at <= now() then
    update public.checkout_holds
    set status = 'EXPIRED'::public.checkout_hold_status
    where id = v_hold.id and status = 'OPEN'::public.checkout_hold_status;
    raise exception 'Checkout hold expired';
  end if;

  select l.owner_id, l.moderation_status, l.status, l.title, l.cancellation_policy_hours, l.advance_notice_hours
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_listing_title, v_cancellation_policy_hours, v_advance_notice_hours
  from public.listings l
  where l.id = v_hold.listing_id;

  v_normal_deadline := public.calculate_reservation_base_payment_deadline(v_hold.start_at, v_cancellation_policy_hours);
  v_payment_deadline := public.calculate_reservation_late_booking_deadline(v_hold.start_at, v_advance_notice_hours);

  if v_listing_owner_id is null then raise exception 'Listing not found'; end if;
  if v_listing_record_status = 'DELETED'::public.record_status then raise exception 'Listing not found'; end if;
  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then raise exception 'This listing is not available for booking yet'; end if;
  if v_payment_deadline <= now() then raise exception 'This reservation can no longer be booked because the host response deadline has passed'; end if;

  perform pg_advisory_xact_lock(hashtext(v_hold.listing_id::text));

  if exists (
    select 1 from public.reservations r
    where r.listing_id = v_hold.listing_id
      and r.status in (
        'PENDING'::public.reservation_status,
        'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status,
        'CONFIRMED'::public.reservation_status
      )
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(v_hold.start_at, v_hold.end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  insert into public.reservations (
    listing_id, renter_id, start_at, end_at, guests, status, payment_deadline, late_consent_given_at, host_preconfirmed_at
  ) values (
    v_hold.listing_id,
    v_hold.renter_id,
    v_hold.start_at,
    v_hold.end_at,
    v_hold.guests,
    'PENDING'::public.reservation_status,
    v_payment_deadline,
    case when now() > v_normal_deadline then now() else null end,
    null
  ) returning * into result;

  update public.checkout_holds
  set status = 'COMPLETED'::public.checkout_hold_status,
      reservation_id = result.id
  where id = v_hold.id;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_hold.renter_id then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      case when now() > v_normal_deadline then 'New late reservation request' else 'New reservation request' end,
      format(
        '%s has a new%s paid reservation request. Confirm it by %s.',
        coalesce(v_listing_title, 'Your listing'),
        case when now() > v_normal_deadline then ' late' else '' end,
        to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
      ),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_hold.listing_id, 'payment_deadline', result.payment_deadline, 'is_late', now() > v_normal_deadline)
    );
  end if;

  return to_jsonb(result);
end;
$function$;
