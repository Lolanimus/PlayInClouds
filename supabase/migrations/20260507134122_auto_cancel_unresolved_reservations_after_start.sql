create or replace function public.transition_pending_reservations_to_late_consent()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transitioned record;
  v_transitioned_count integer := 0;
begin
  for v_transitioned in
    with updated as (
      update public.reservations r
      set status = 'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
      from public.listings l
      where r.listing_id = l.id
        and r.status = 'PENDING'::public.reservation_status
        and r.late_consent_given_at is null
        and r.start_at > now()
        and r.payment_deadline > now()
        and public.calculate_reservation_base_payment_deadline(r.start_at, l.cancellation_policy_hours) <= now()
      returning r.id, r.renter_id, l.owner_id, r.listing_id, l.title as listing_title, r.payment_deadline
    )
    select * from updated
  loop
    v_transitioned_count := v_transitioned_count + 1;

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
    end if;
  end loop;

  return v_transitioned_count;
end;
$function$;

create or replace function public.auto_cancel_pending_reservations_for_advance_notice()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cancelled record;
  v_cancelled_count integer := 0;
begin
  for v_cancelled in
    with updated as (
      update public.reservations r
      set status = 'CANCELLED'::public.reservation_status
      where r.status in (
        'PENDING'::public.reservation_status,
        'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
      )
        and (
          r.payment_deadline <= now()
          or r.start_at <= now()
        )
        and not exists (
          select 1
          from public.reservation_payments rp
          where rp.reservation_id = r.id
            and rp.status = 'AUTH'::public.payment_status
        )
      returning r.id, r.renter_id, r.listing_id, r.start_at, r.payment_deadline
    )
    select u.id, u.renter_id, l.owner_id, u.listing_id, l.title as listing_title, u.start_at, u.payment_deadline
    from updated u
    join public.listings l on l.id = u.listing_id
  loop
    v_cancelled_count := v_cancelled_count + 1;
    perform public.notify_auto_cancelled_pending_reservation(
      v_cancelled.id,
      v_cancelled.renter_id,
      v_cancelled.owner_id,
      v_cancelled.listing_id,
      v_cancelled.listing_title,
      case
        when v_cancelled.start_at <= now() then 'reservation_started_unconfirmed'
        else 'payment_deadline_passed'
      end
    );
  end loop;
  return v_cancelled_count;
end;
$function$;
