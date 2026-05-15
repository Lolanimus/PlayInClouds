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
  v_listing_time_zone text;
  v_status public.reservation_status;
  v_start_at timestamptz;
  v_late_consent_given_at timestamptz;
  v_host_preconfirmed_at timestamptz;
  v_cancellation_policy_hours integer;
  v_normal_deadline timestamptz;
  v_renter_email text;
  v_renter_first_name text;
  v_renter_last_name text;
  v_host_first_name text;
  v_host_last_name text;
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
    l.timezone,
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
    v_listing_time_zone,
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

      select
        renter.email,
        renter.first_name,
        renter.last_name,
        host.first_name,
        host.last_name
      into
        v_renter_email,
        v_renter_first_name,
        v_renter_last_name,
        v_host_first_name,
        v_host_last_name
      from public."user" renter
      join public."user" host on host.id = v_owner_id
      where renter.id = v_renter_id;

      if v_renter_email is not null then
        perform public.enqueue_email(
          'late_reservation_status_changed',
          'booker',
          v_renter_id,
          v_renter_email,
          jsonb_build_object(
            'reservation_id', result.id,
            'listing_id', v_listing_id,
            'listing_title', v_listing_title,
            'listing_time_zone', coalesce(v_listing_time_zone, 'UTC'),
            'start_at', result.start_at,
            'end_at', result.end_at,
            'payment_deadline', result.payment_deadline,
            'late_state', 'late_reservation_host_approved',
            'renter_first_name', v_renter_first_name,
            'renter_last_name', v_renter_last_name,
            'host_first_name', v_host_first_name,
            'host_last_name', v_host_last_name
          ),
          'late-reservation-host-approved-' || result.id::text
        );
      end if;
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
  v_listing_time_zone text;
  v_status public.reservation_status;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_payment_deadline timestamptz;
  v_host_preconfirmed_at timestamptz;
  v_owner_email text;
  v_renter_first_name text;
  v_renter_last_name text;
  v_host_first_name text;
  v_host_last_name text;
  v_reservation_confirmed boolean := false;
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
    l.timezone,
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
    v_listing_time_zone,
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

  select
    host.email,
    renter.first_name,
    renter.last_name,
    host.first_name,
    host.last_name
  into
    v_owner_email,
    v_renter_first_name,
    v_renter_last_name,
    v_host_first_name,
    v_host_last_name
  from public."user" renter
  join public."user" host on host.id = v_owner_id
  where renter.id = v_renter_id;

  if v_host_preconfirmed_at is not null then
    select * into result
    from public.finalize_confirmed_reservation(p_reservation_id);

    v_reservation_confirmed := true;
  end if;

  if v_owner_id is not null and v_owner_id <> v_uid then
    perform public.create_notification(
      v_owner_id,
      'late_reservation_guest_continued',
      case
        when v_reservation_confirmed then 'Guest accepted late request'
        else 'Guest continued late request'
      end,
      case
        when v_reservation_confirmed then
          format(
            'The guest accepted the late-request terms for %s. The reservation is now confirmed.',
            coalesce(v_listing_title, 'your listing')
          )
        else
          format(
            'The guest accepted the late-request terms for %s. You can confirm it by %s.',
            coalesce(v_listing_title, 'your listing'),
            to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
          )
      end,
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id, 'payment_deadline', result.payment_deadline)
    );

    if v_owner_email is not null then
      perform public.enqueue_email(
        'late_reservation_status_changed',
        'host',
        v_owner_id,
        v_owner_email,
        jsonb_build_object(
          'reservation_id', result.id,
          'listing_id', v_listing_id,
          'listing_title', v_listing_title,
          'listing_time_zone', coalesce(v_listing_time_zone, 'UTC'),
            'start_at', result.start_at,
            'end_at', result.end_at,
            'payment_deadline', result.payment_deadline,
            'late_state', 'late_reservation_guest_continued',
            'reservation_confirmed', v_reservation_confirmed,
            'renter_first_name', v_renter_first_name,
            'renter_last_name', v_renter_last_name,
            'host_first_name', v_host_first_name,
          'host_last_name', v_host_last_name
        ),
        'late-reservation-guest-continued-' || result.id::text
      );
    end if;
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

create or replace function public.transition_pending_reservations_to_late_consent()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transitioned record;
  v_transitioned_count integer := 0;
  v_renter_email text;
  v_owner_email text;
  v_renter_first_name text;
  v_renter_last_name text;
  v_host_first_name text;
  v_host_last_name text;
begin
  for v_transitioned in
    with updated as (
      update public.reservations r
      set status = 'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
      from public.listings l
      where r.listing_id = l.id
        and r.status = 'PENDING'::public.reservation_status
        and r.late_consent_given_at is null
        and r.payment_deadline > now()
        and public.calculate_reservation_base_payment_deadline(r.start_at, l.cancellation_policy_hours) <= now()
      returning
        r.id,
        r.renter_id,
        l.owner_id,
        r.listing_id,
        l.title as listing_title,
        l.timezone as listing_time_zone,
        r.start_at,
        r.end_at,
        r.payment_deadline
    )
    select * from updated
  loop
    v_transitioned_count := v_transitioned_count + 1;

    select
      renter.email,
      host.email,
      renter.first_name,
      renter.last_name,
      host.first_name,
      host.last_name
    into
      v_renter_email,
      v_owner_email,
      v_renter_first_name,
      v_renter_last_name,
      v_host_first_name,
      v_host_last_name
    from public."user" renter
    left join public."user" host on host.id = v_transitioned.owner_id
    where renter.id = v_transitioned.renter_id;

    if v_transitioned.renter_id is not null then
      perform public.create_notification(
        v_transitioned.renter_id,
        'late_reservation_consent_required',
        'Late request needs your approval',
        format(
          'This reservation for %s has entered the late-request window. Continue before %s if you still want it. After you continue, you will no longer be able to cancel.',
          coalesce(v_transitioned.listing_title, 'this listing'),
          to_char(v_transitioned.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
        ),
        '/reservation/' || v_transitioned.id::text,
        'reservation',
        v_transitioned.id::text,
        jsonb_build_object('reservation_id', v_transitioned.id, 'listing_id', v_transitioned.listing_id, 'payment_deadline', v_transitioned.payment_deadline)
      );

      if v_renter_email is not null then
        perform public.enqueue_email(
          'late_reservation_status_changed',
          'booker',
          v_transitioned.renter_id,
          v_renter_email,
          jsonb_build_object(
            'reservation_id', v_transitioned.id,
            'listing_id', v_transitioned.listing_id,
            'listing_title', v_transitioned.listing_title,
            'listing_time_zone', coalesce(v_transitioned.listing_time_zone, 'UTC'),
            'start_at', v_transitioned.start_at,
            'end_at', v_transitioned.end_at,
            'payment_deadline', v_transitioned.payment_deadline,
            'late_state', 'late_reservation_consent_required',
            'renter_first_name', v_renter_first_name,
            'renter_last_name', v_renter_last_name,
            'host_first_name', v_host_first_name,
            'host_last_name', v_host_last_name
          ),
          'late-reservation-consent-required-' || v_transitioned.id::text
        );
      end if;
    end if;

    if v_transitioned.owner_id is not null and v_transitioned.owner_id <> v_transitioned.renter_id then
      perform public.create_notification(
        v_transitioned.owner_id,
        'late_reservation_waiting_for_guest',
        'Waiting for guest late-request approval',
        format(
          'The guest must continue the late request for %s before you can finalize it.',
          coalesce(v_transitioned.listing_title, 'your listing')
        ),
        '/reservation/' || v_transitioned.id::text,
        'reservation',
        v_transitioned.id::text,
        jsonb_build_object('reservation_id', v_transitioned.id, 'listing_id', v_transitioned.listing_id, 'payment_deadline', v_transitioned.payment_deadline)
      );

      if v_owner_email is not null then
        perform public.enqueue_email(
          'late_reservation_status_changed',
          'host',
          v_transitioned.owner_id,
          v_owner_email,
          jsonb_build_object(
            'reservation_id', v_transitioned.id,
            'listing_id', v_transitioned.listing_id,
            'listing_title', v_transitioned.listing_title,
            'listing_time_zone', coalesce(v_transitioned.listing_time_zone, 'UTC'),
            'start_at', v_transitioned.start_at,
            'end_at', v_transitioned.end_at,
            'payment_deadline', v_transitioned.payment_deadline,
            'late_state', 'late_reservation_waiting_for_guest',
            'renter_first_name', v_renter_first_name,
            'renter_last_name', v_renter_last_name,
            'host_first_name', v_host_first_name,
            'host_last_name', v_host_last_name
          ),
          'late-reservation-waiting-for-guest-' || v_transitioned.id::text
        );
      end if;
    end if;
  end loop;

  return v_transitioned_count;
end;
$function$;
