alter table public.reservations
  add column if not exists cancellable_until timestamptz;

update public.reservations
set confirm_by_at = start_at
where confirm_by_at is null;

update public.reservations
set cancellable_until = coalesce(confirm_by_at, start_at)
where cancellable_until is null;

create or replace function public.calculate_reservation_cancellable_until(
  p_confirm_by_at timestamptz,
  p_authorization_expires_at timestamptz,
  p_safety_buffer interval default interval '30 minutes'
) returns timestamptz as $$
begin
  if p_authorization_expires_at is null then
    return p_confirm_by_at;
  end if;

  return least(
    p_confirm_by_at,
    p_authorization_expires_at - p_safety_buffer
  );
end;
$$ language plpgsql immutable set search_path = '';

create or replace function public.calculate_reservation_confirm_by_at(
  p_start_at timestamptz,
  p_cancellation_policy_hours integer
) returns timestamptz as $$
begin
  if p_cancellation_policy_hours is null then
    return p_start_at;
  end if;

  return p_start_at - make_interval(hours => greatest(p_cancellation_policy_hours, 0));
end;
$$ language plpgsql immutable set search_path = '';

update public.reservations r
set confirm_by_at = public.calculate_reservation_confirm_by_at(
  r.start_at,
  l.cancellation_policy_hours
)
from public.listings l
where l.id = r.listing_id;

update public.reservations
set cancellable_until = confirm_by_at;

update public.reservations r
set cancellable_until = public.calculate_reservation_cancellable_until(
  r.confirm_by_at,
  rp.authorization_expires_at
)
from public.reservation_payments rp
where rp.reservation_id = r.id
  and rp.status = 'AUTH'::public.payment_status;

create or replace function public.set_reservation_deadlines_default_fn()
returns trigger as $$
begin
  if new.confirm_by_at is null then
    new.confirm_by_at := new.start_at;
  end if;

  if new.cancellable_until is null then
    new.cancellable_until := new.confirm_by_at;
  end if;

  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists set_reservation_confirm_by_at_default on public.reservations;
drop trigger if exists set_reservation_deadlines_default on public.reservations;
create trigger set_reservation_deadlines_default
before insert or update of start_at, confirm_by_at, cancellable_until
on public.reservations
for each row
execute function public.set_reservation_deadlines_default_fn();

alter table public.reservations
  alter column confirm_by_at set not null,
  alter column cancellable_until set not null;

create index if not exists idx_reservations_pending_cancellable_until
  on public.reservations (cancellable_until, start_at)
  where status = 'PENDING'::public.reservation_status;

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
  v_confirm_by_at timestamptz;
  v_cancellation_policy_hours integer;
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
    l.cancellation_policy_hours
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_listing_title, v_cancellation_policy_hours
  from public.listings l
  where l.id = p_listing_id;

  v_confirm_by_at := public.calculate_reservation_confirm_by_at(
    p_start_at,
    v_cancellation_policy_hours
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

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = p_listing_id
      and r.status in ('PENDING', 'CONFIRMED')
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

  insert into public.reservations (
    listing_id,
    renter_id,
    start_at,
    end_at,
    guests,
    status,
    confirm_by_at,
    cancellable_until
  )
  values (
    p_listing_id,
    v_uid,
    p_start_at,
    p_end_at,
    p_guests,
    'PENDING',
    coalesce(v_confirm_by_at, p_start_at),
    coalesce(v_confirm_by_at, p_start_at)
  )
  returning * into result;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_uid then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      'New reservation request',
      format('%s has a new reservation request.', coalesce(v_listing_title, 'Your listing')),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', p_listing_id)
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
  v_confirm_by_at timestamptz;
  v_cancellation_policy_hours integer;
  result public.reservations%rowtype;
begin
  select *
  into v_hold
  from public.checkout_holds h
  where h.id = p_hold_id;

  if v_hold.id is null then
    raise exception 'Checkout hold not found';
  end if;

  if v_hold.status <> 'OPEN'::public.checkout_hold_status then
    raise exception 'Checkout hold is no longer open';
  end if;

  if v_hold.expires_at <= now() then
    update public.checkout_holds
    set status = 'EXPIRED'::public.checkout_hold_status
    where id = v_hold.id
      and status = 'OPEN'::public.checkout_hold_status;

    raise exception 'Checkout hold expired';
  end if;

  select
    l.owner_id,
    l.moderation_status,
    l.status,
    l.title,
    l.cancellation_policy_hours
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_listing_title, v_cancellation_policy_hours
  from public.listings l
  where l.id = v_hold.listing_id;

  v_confirm_by_at := public.calculate_reservation_confirm_by_at(
    v_hold.start_at,
    v_cancellation_policy_hours
  );

  if v_listing_owner_id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing_record_status = 'DELETED'::public.record_status then
    raise exception 'Listing not found';
  end if;

  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_hold.listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = v_hold.listing_id
      and r.status in ('PENDING', 'CONFIRMED')
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(v_hold.start_at, v_hold.end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  insert into public.reservations (
    listing_id,
    renter_id,
    start_at,
    end_at,
    guests,
    status,
    confirm_by_at,
    cancellable_until
  )
  values (
    v_hold.listing_id,
    v_hold.renter_id,
    v_hold.start_at,
    v_hold.end_at,
    v_hold.guests,
    'PENDING',
    coalesce(v_confirm_by_at, v_hold.start_at),
    coalesce(v_confirm_by_at, v_hold.start_at)
  )
  returning * into result;

  update public.checkout_holds
  set
    status = 'COMPLETED'::public.checkout_hold_status,
    reservation_id = result.id
  where id = v_hold.id;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_hold.renter_id then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      'New reservation request',
      format('%s has a new paid reservation request.', coalesce(v_listing_title, 'Your listing')),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_hold.listing_id)
    );
  end if;

  return to_jsonb(result);
end;
$function$;

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
  v_cancellable_until timestamptz;
  v_cancellation_policy_hours integer;
  v_listing_deleted boolean := false;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.renter_id, l.owner_id, r.listing_id, l.title, r.start_at, r.cancellable_until,
         l.cancellation_policy_hours,
         (l.status = 'DELETED'::public.record_status)
  into v_renter_id, v_owner_id, v_listing_id, v_listing_title, v_start_at, v_cancellable_until,
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

  if v_cancellable_until <= now() then
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
      where r.status = 'PENDING'::public.reservation_status
        and r.cancellable_until <= now()
        and not exists (
          select 1
          from public.reservation_payments rp
          where rp.reservation_id = r.id
            and rp.status = 'AUTH'::public.payment_status
        )
      returning r.id, r.renter_id, r.listing_id, r.start_at, r.confirm_by_at, r.cancellable_until
    )
    select
      u.id,
      u.renter_id,
      l.owner_id,
      u.listing_id,
      l.title as listing_title,
      u.start_at,
      u.confirm_by_at,
      u.cancellable_until
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
        when v_cancelled.start_at <= now() then 'start_time_passed'
        else 'advance_notice_window_passed'
      end
    );
  end loop;

  return v_cancelled_count;
end;
$function$;

create or replace function public.sync_pending_reservation_review_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prompt record;
  v_created_count integer := 0;
begin
  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.type = 'pending_reservation_review_reminder'
    and n.entity_type = 'reservation'
    and not n.is_read
    and not exists (
      select 1
      from public.reservations r
      where r.id::text = n.entity_id
        and r.status = 'PENDING'::public.reservation_status
        and r.cancellable_until > now()
    );

  for v_prompt in
    select
      r.id as reservation_id,
      r.listing_id,
      l.owner_id,
      l.title as listing_title,
      r.start_at,
      r.renter_id,
      r.confirm_by_at,
      r.cancellable_until as review_deadline
    from public.reservations r
    join public.listings l on l.id = r.listing_id
    where r.status = 'PENDING'::public.reservation_status
      and l.owner_id is not null
      and r.cancellable_until > now()
      and now() >= r.cancellable_until - interval '30 minutes'
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = l.owner_id
          and n.type = 'pending_reservation_review_reminder'
          and n.entity_type = 'reservation'
          and n.entity_id = r.id::text
      )
  loop
    begin
      perform public.create_notification(
        v_prompt.owner_id,
        'pending_reservation_review_reminder',
        'Review pending reservation',
        format('A reservation request for %s expires in less than 30 minutes. Review it now before the confirmation deadline passes.', coalesce(v_prompt.listing_title, 'your listing')),
        '/reservation/' || v_prompt.reservation_id::text,
        'reservation',
        v_prompt.reservation_id::text,
        jsonb_build_object(
          'reservation_id', v_prompt.reservation_id,
          'listing_id', v_prompt.listing_id,
          'renter_id', v_prompt.renter_id,
          'start_at', v_prompt.start_at,
          'confirm_by_at', v_prompt.confirm_by_at,
          'review_deadline', v_prompt.review_deadline,
          'reminder_type', 'host_review_before_confirmation_deadline'
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
