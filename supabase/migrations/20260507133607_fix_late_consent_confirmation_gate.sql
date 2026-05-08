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
