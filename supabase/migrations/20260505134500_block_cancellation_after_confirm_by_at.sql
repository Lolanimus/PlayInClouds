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
  v_confirm_by_at timestamptz;
  v_cancellation_policy_hours integer;
  v_listing_deleted boolean := false;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.renter_id, l.owner_id, r.listing_id, l.title, r.start_at, r.confirm_by_at,
         l.cancellation_policy_hours,
         (l.status = 'DELETED'::public.record_status)
  into v_renter_id, v_owner_id, v_listing_id, v_listing_title, v_start_at, v_confirm_by_at,
       v_cancellation_policy_hours, v_listing_deleted
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_renter_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_uid <> v_renter_id and v_uid <> v_owner_id then
    raise exception 'Only renter or listing owner can cancel this reservation';
  end if;

  if v_listing_deleted and not public.current_user_can_view_deleted_rows() then
    raise exception 'This listing has been removed';
  end if;

  if v_confirm_by_at < now() then
    raise exception 'This reservation can no longer be cancelled';
  end if;

  if v_uid = v_renter_id and v_uid <> v_owner_id then
    if v_start_at <= now() then
      raise exception 'Ongoing reservations cannot be cancelled by renter';
    end if;

    if v_cancellation_policy_hours is not null
       and now() > (v_start_at - make_interval(hours => v_cancellation_policy_hours)) then
      raise exception 'Cancellation window has ended for this reservation';
    end if;
  end if;

  update public.reservations r
  set status = 'CANCELLED'
  where r.id = p_reservation_id
    and r.status <> 'CANCELLED'
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
