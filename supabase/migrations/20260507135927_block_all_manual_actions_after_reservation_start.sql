create or replace function public.confirm_reservation_internal(
  p_reservation_id uuid,
  p_require_owner boolean default true
) returns public.reservations as $function$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_end_at timestamptz;
  v_payment_deadline timestamptz;
  v_renter_id uuid;
  v_listing_id uuid;
  v_listing_title text;
  v_status public.reservation_status;
  v_start_at timestamptz;
  v_late_consent_given_at timestamptz;
  v_host_preconfirmed_at timestamptz;
  v_cancellation_policy_hours integer;
  v_normal_deadline timestamptz;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Authentication required'; end if;

  select
    l.owner_id,
    r.end_at,
    r.payment_deadline,
    r.renter_id,
    r.listing_id,
    l.title,
    r.status,
    r.start_at,
    r.late_consent_given_at,
    r.host_preconfirmed_at,
    l.cancellation_policy_hours
  into
    v_owner_id,
    v_end_at,
    v_payment_deadline,
    v_renter_id,
    v_listing_id,
    v_listing_title,
    v_status,
    v_start_at,
    v_late_consent_given_at,
    v_host_preconfirmed_at,
    v_cancellation_policy_hours
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id
    and l.status = 'ACTIVE'::public.record_status;

  if v_owner_id is null then raise exception 'Reservation not found'; end if;
  if p_require_owner and not public.current_user_can_manage_listing(v_listing_id) then
    raise exception 'Only the listing owner or an admin can confirm this reservation';
  end if;
  if v_status = 'CANCELLED'::public.reservation_status then raise exception 'Cancelled reservations cannot be confirmed'; end if;
  if v_status = 'CONFIRMED'::public.reservation_status then raise exception 'Reservation is already confirmed'; end if;
  if v_start_at <= now() then raise exception 'Reservations that have already started cannot be confirmed'; end if;
  if v_end_at <= now() then raise exception 'Past reservations cannot be confirmed'; end if;
  if v_payment_deadline <= now() then raise exception 'This reservation expired before it was confirmed'; end if;

  v_normal_deadline := public.calculate_reservation_base_payment_deadline(v_start_at, v_cancellation_policy_hours);

  if v_late_consent_given_at is null
     and (
       v_status = 'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
       or now() >= v_normal_deadline
     ) then
    update public.reservations r
    set
      status = 'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status,
      host_preconfirmed_at = coalesce(r.host_preconfirmed_at, now())
    where r.id = p_reservation_id
      and r.status in (
        'PENDING'::public.reservation_status,
        'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
      )
    returning * into result;

    if result.id is null then
      raise exception 'Reservation could not be updated for late consent';
    end if;

    if v_host_preconfirmed_at is null and v_renter_id is not null and v_renter_id <> v_owner_id then
      perform public.create_notification(
        v_renter_id,
        'late_reservation_host_approved',
        'Host approved your late request',
        format(
          'The host approved your late request for %s. Accept before %s to finalize it. After you accept, you will no longer be able to cancel.',
          coalesce(v_listing_title, 'this listing'),
          to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
        ),
        '/reservation/' || result.id::text,
        'reservation',
        result.id::text,
        jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id, 'payment_deadline', result.payment_deadline)
      );
    end if;

    return result;
  end if;

  select * into result
  from public.finalize_confirmed_reservation(p_reservation_id);

  return result;
end;
$function$ language plpgsql security definer set search_path = '';

create or replace function public.accept_late_reservation_terms(
  p_reservation_id uuid
) returns jsonb as $function$
declare
  v_uid uuid;
  v_renter_id uuid;
  v_owner_id uuid;
  v_listing_id uuid;
  v_listing_title text;
  v_status public.reservation_status;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_payment_deadline timestamptz;
  v_host_preconfirmed_at timestamptz;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    r.renter_id,
    l.owner_id,
    r.listing_id,
    l.title,
    r.status,
    r.start_at,
    r.end_at,
    r.payment_deadline,
    r.host_preconfirmed_at
  into
    v_renter_id,
    v_owner_id,
    v_listing_id,
    v_listing_title,
    v_status,
    v_start_at,
    v_end_at,
    v_payment_deadline,
    v_host_preconfirmed_at
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_renter_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_uid <> v_renter_id then
    raise exception 'Only the renter can accept late request terms';
  end if;

  if v_status <> 'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status then
    raise exception 'This reservation is not waiting for late consent';
  end if;

  if v_start_at <= now() then
    raise exception 'Reservations that have already started cannot be updated';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be updated';
  end if;

  if v_payment_deadline <= now() then
    raise exception 'This late request has expired';
  end if;

  update public.reservations r
  set
    late_consent_given_at = coalesce(r.late_consent_given_at, now()),
    status = case when v_host_preconfirmed_at is null then 'PENDING'::public.reservation_status else r.status end
  where r.id = p_reservation_id
    and r.status = 'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
  returning * into result;

  if result.id is null then
    raise exception 'Late consent could not be recorded';
  end if;

  if v_host_preconfirmed_at is not null then
    select * into result
    from public.finalize_confirmed_reservation(p_reservation_id);
  elsif v_owner_id is not null and v_owner_id <> v_uid then
    perform public.create_notification(
      v_owner_id,
      'late_reservation_guest_continued',
      'Guest continued late request',
      format(
        'The guest accepted the late-request terms for %s. You can confirm it by %s.',
        coalesce(v_listing_title, 'your listing'),
        to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
      ),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id, 'payment_deadline', result.payment_deadline)
    );
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

create or replace function public.cancel_reservation(
  p_reservation_id uuid
) returns jsonb as $function$
declare
  v_uid uuid;
  v_renter_id uuid;
  v_owner_id uuid;
  v_listing_id uuid;
  v_listing_title text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_payment_deadline timestamptz;
  v_status public.reservation_status;
  v_late_consent_given_at timestamptz;
  v_listing_deleted boolean := false;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    r.renter_id,
    l.owner_id,
    r.listing_id,
    l.title,
    r.start_at,
    r.end_at,
    r.payment_deadline,
    r.status,
    r.late_consent_given_at,
    (l.status = 'DELETED'::public.record_status)
  into
    v_renter_id,
    v_owner_id,
    v_listing_id,
    v_listing_title,
    v_start_at,
    v_end_at,
    v_payment_deadline,
    v_status,
    v_late_consent_given_at,
    v_listing_deleted
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_renter_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_uid <> v_renter_id and v_uid <> v_owner_id then
    raise exception 'Only renter or listing owner can cancel this reservation';
  end if;

  if v_late_consent_given_at is not null and v_uid = v_renter_id and v_uid <> v_owner_id then
    raise exception 'You can no longer cancel this reservation after accepting late-request terms';
  end if;

  if v_listing_deleted and not public.current_user_can_view_deleted_rows() then
    raise exception 'This listing has been removed';
  end if;

  if v_start_at <= now() then
    raise exception 'Reservations that have already started cannot be cancelled';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be cancelled';
  end if;

  if v_payment_deadline <= now() then
    raise exception 'This reservation can no longer be cancelled';
  end if;

  update public.reservations r
  set status = 'CANCELLED'::public.reservation_status
  where r.id = p_reservation_id
    and r.status <> 'CANCELLED'::public.reservation_status
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already cancelled';
  end if;

  if not v_listing_deleted then
    if v_uid = v_renter_id and v_owner_id is not null and v_owner_id <> v_uid then
      perform public.create_notification(
        v_owner_id,
        'reservation_cancelled',
        'Reservation cancelled',
        format('A reservation for %s was cancelled by the guest.', coalesce(v_listing_title, 'your listing')),
        '/reservation/' || result.id::text,
        'reservation',
        result.id::text,
        jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id)
      );
    elsif v_uid = v_owner_id and v_renter_id is not null and v_renter_id <> v_uid then
      perform public.create_notification(
        v_renter_id,
        'reservation_cancelled',
        'Reservation cancelled',
        format('Your reservation for %s was cancelled by the host.', coalesce(v_listing_title, 'this listing')),
        '/reservation/' || result.id::text,
        'reservation',
        result.id::text,
        jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id)
      );
    end if;
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';
