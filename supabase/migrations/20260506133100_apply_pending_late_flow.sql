create or replace function public.calculate_reservation_late_booking_deadline(
  p_start_at timestamptz,
  p_advance_notice_hours integer
) returns timestamptz as $$
begin
  if p_advance_notice_hours is null then
    return p_start_at;
  end if;

  return p_start_at - make_interval(hours => greatest(p_advance_notice_hours, 0));
end;
$$ language plpgsql immutable set search_path = '';

drop index if exists idx_reservations_pending_payment_deadline;
create index if not exists idx_reservations_open_payment_deadline
  on public.reservations (payment_deadline, start_at)
  where status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status);

create or replace function public.enforce_reservation_status_transition_fn()
returns trigger as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'CANCELLED'::public.reservation_status then
    raise exception 'Cancelled reservation cannot change status';
  end if;

  if old.status = 'CONFIRMED'::public.reservation_status
     and new.status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status) then
    raise exception 'Confirmed reservation cannot be changed back to pending';
  end if;

  if old.status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status)
     and new.status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status) then
    raise exception 'Pending reservation type cannot be changed after creation';
  end if;

  return new;
end;
$$ language plpgsql set search_path = '';

create or replace function public.validate_and_price_reservation_fn()
returns trigger as $$
declare
  v_total double precision := 0;
  v_hour_ts timestamptz;
  v_weekday smallint;
  v_hour smallint;
  v_slot_price double precision;
  v_listing_timezone text;
  v_advance_notice_hours integer;
  v_minimum_start_at timestamptz;
begin
  if date_part('minute', new.start_at) <> 0 or date_part('second', new.start_at) <> 0
     or date_part('minute', new.end_at) <> 0 or date_part('second', new.end_at) <> 0 then
    raise exception 'Reservations must start/end on full hour boundaries';
  end if;

  if new.end_at <= new.start_at then
    raise exception 'Invalid reservation range';
  end if;

  select coalesce(l.timezone, 'UTC'), l.advance_notice_hours
  into v_listing_timezone, v_advance_notice_hours
  from public.listings l
  where l.id = new.listing_id;

  if v_listing_timezone is null then
    raise exception 'Listing not found';
  end if;

  v_minimum_start_at := public.calculate_advance_notice_start_at(
    v_listing_timezone,
    v_advance_notice_hours,
    now()
  );

  if v_minimum_start_at is not null and new.start_at < v_minimum_start_at then
    raise exception 'Reservations for this listing require % hour(s) of advance notice', coalesce(v_advance_notice_hours, 0);
  end if;

  v_hour_ts := new.start_at;
  while v_hour_ts < new.end_at loop
    v_weekday := extract(dow from (v_hour_ts at time zone v_listing_timezone))::smallint;
    v_hour := extract(hour from (v_hour_ts at time zone v_listing_timezone))::smallint;

    select s.price into v_slot_price
    from public.listing_weekly_slots s
    where s.listing_id = new.listing_id
      and s.weekday = v_weekday
      and s.hour = v_hour;

    if v_slot_price is null then
      raise exception 'Hour % on weekday % is closed for this listing', v_hour, v_weekday;
    end if;

    v_total := v_total + v_slot_price;
    v_hour_ts := v_hour_ts + interval '1 hour';
  end loop;

  perform pg_advisory_xact_lock(hashtext(new.listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = new.listing_id
      and r.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED')
      and (new.id is null or r.id <> new.id)
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'Reservation overlaps an existing active reservation';
  end if;

  new.total_price := v_total;
  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists validate_and_price_reservation on public.reservations;
create trigger validate_and_price_reservation
before insert or update of listing_id, start_at, end_at, status
on public.reservations
for each row
when (new.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED'))
execute function public.validate_and_price_reservation_fn();

create or replace function public.list_listing_week_slots(
  p_listing_id uuid,
  p_week date
) returns setof jsonb as $$
declare
  v_timezone text;
  v_advance_notice_hours integer;
  v_minimum_start_at timestamptz;
begin
  select coalesce(l.timezone, 'UTC'), l.advance_notice_hours
  into v_timezone, v_advance_notice_hours
  from public.listings l
  where l.id = p_listing_id;

  if v_timezone is null then
    raise exception 'Listing not found';
  end if;

  v_minimum_start_at := public.calculate_advance_notice_start_at(
    v_timezone,
    v_advance_notice_hours,
    now()
  );

  return query
  with day_grid as (
    select generate_series(
      date_trunc('week', p_week)::date,
      (date_trunc('week', p_week) + interval '6 days')::date,
      interval '1 day'
    )::date as slot_date
  ),
  hour_grid as (
    select generate_series(0, 23) as hour
  ),
  base as (
    select
      d.slot_date,
      h.hour,
      extract(dow from d.slot_date)::smallint as weekday,
      s.price
    from day_grid d
    cross join hour_grid h
    left join public.listing_weekly_slots s
      on s.listing_id = p_listing_id
     and s.weekday = extract(dow from d.slot_date)::smallint
     and s.hour = h.hour
  ),
  slots as (
    select
      b.slot_date,
      b.hour,
      b.price,
      make_timestamptz(
        extract(year from b.slot_date)::int,
        extract(month from b.slot_date)::int,
        extract(day from b.slot_date)::int,
        b.hour,
        0,
        0,
        v_timezone
      ) as slot_start_at
    from base b
  )
  select jsonb_build_object(
    'date', s.slot_date,
    'hour', s.hour,
    'price', s.price,
    'is_booked',
      exists (
        select 1
        from public.reservations r
        where r.listing_id = p_listing_id
          and r.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED')
          and tstzrange(r.start_at, r.end_at, '[)') &&
                tstzrange(s.slot_start_at, s.slot_start_at + interval '1 hour', '[)')
      ),
    'is_booking_restricted', v_minimum_start_at is not null and s.slot_start_at < v_minimum_start_at
  )
  from slots s
  order by s.slot_date, s.hour;
end;
$$ language plpgsql set search_path = '';

create or replace function public.list_listing_month_slots(
  p_listing_id uuid,
  p_month date
) returns setof jsonb as $$
declare
  v_timezone text;
  v_advance_notice_hours integer;
  v_minimum_start_at timestamptz;
begin
  select coalesce(l.timezone, 'UTC'), l.advance_notice_hours
  into v_timezone, v_advance_notice_hours
  from public.listings l
  where l.id = p_listing_id;

  if v_timezone is null then
    raise exception 'Listing not found';
  end if;

  v_minimum_start_at := public.calculate_advance_notice_start_at(
    v_timezone,
    v_advance_notice_hours,
    now()
  );

  return query
  with day_grid as (
    select generate_series(
      date_trunc('month', p_month)::date,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date,
      interval '1 day'
    )::date as slot_date
  ),
  hour_grid as (
    select generate_series(0, 23) as hour
  ),
  base as (
    select
      d.slot_date,
      h.hour,
      extract(dow from d.slot_date)::smallint as weekday,
      s.price
    from day_grid d
    cross join hour_grid h
    left join public.listing_weekly_slots s
      on s.listing_id = p_listing_id
     and s.weekday = extract(dow from d.slot_date)::smallint
     and s.hour = h.hour
  ),
  slots as (
    select
      b.slot_date,
      b.hour,
      b.price,
      make_timestamptz(
        extract(year from b.slot_date)::int,
        extract(month from b.slot_date)::int,
        extract(day from b.slot_date)::int,
        b.hour,
        0,
        0,
        v_timezone
      ) as slot_start_at
    from base b
  )
  select jsonb_build_object(
    'date', s.slot_date,
    'hour', s.hour,
    'price', s.price,
    'is_booked',
      exists (
        select 1
        from public.reservations r
        where r.listing_id = p_listing_id
          and r.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED')
          and tstzrange(r.start_at, r.end_at, '[)') &&
                tstzrange(s.slot_start_at, s.slot_start_at + interval '1 hour', '[)')
      ),
    'is_booking_restricted', v_minimum_start_at is not null and s.slot_start_at < v_minimum_start_at
  )
  from slots s
  order by s.slot_date, s.hour;
end;
$$ language plpgsql set search_path = '';

create or replace function public.create_checkout_hold(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer default 1,
  p_expires_at timestamptz default now() + interval '30 minutes'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_listing_owner_id uuid;
  v_listing_status public.listing_moderation_status;
  v_listing_record_status public.record_status;
  v_cancellation_policy_hours integer;
  v_advance_notice_hours integer;
  v_late_booking_deadline timestamptz;
  result public.checkout_holds%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    l.owner_id,
    l.moderation_status,
    l.status,
    l.cancellation_policy_hours,
    l.advance_notice_hours
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_cancellation_policy_hours, v_advance_notice_hours
  from public.listings l
  where l.id = p_listing_id;

  if v_listing_owner_id is null then
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

  v_late_booking_deadline := public.calculate_reservation_late_booking_deadline(
    p_start_at,
    v_advance_notice_hours
  );

  if v_late_booking_deadline <= now() then
    raise exception 'This reservation can no longer be booked because the host response deadline has passed';
  end if;

  perform public.quote_reservation_total(p_listing_id, p_start_at, p_end_at);

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = p_listing_id
      and r.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED')
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  if exists (
    select 1
    from public.checkout_holds h
    where h.listing_id = p_listing_id
      and h.status = 'OPEN'
      and h.expires_at > now()
      and h.renter_id <> v_uid
      and tstzrange(h.start_at, h.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'This time slot is currently being checked out by another guest. Please try again in a moment.';
  end if;

  insert into public.checkout_holds (
    listing_id,
    renter_id,
    start_at,
    end_at,
    guests,
    expires_at,
    status
  ) values (
    p_listing_id,
    v_uid,
    p_start_at,
    p_end_at,
    p_guests,
    p_expires_at,
    'OPEN'
  )
  returning * into result;

  return to_jsonb(result);
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
  v_listing_status public.listing_moderation_status;
  v_listing_record_status public.record_status;
  v_listing_owner_id uuid;
  v_listing_title text;
  v_cancellation_policy_hours integer;
  v_advance_notice_hours integer;
  v_normal_deadline timestamptz;
  v_late_deadline timestamptz;
  v_reservation_status public.reservation_status := 'PENDING'::public.reservation_status;
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
  if v_uid is null then raise exception 'Authentication required'; end if;

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

  v_normal_deadline := public.calculate_reservation_base_payment_deadline(p_start_at, v_cancellation_policy_hours);
  v_late_deadline := public.calculate_reservation_late_booking_deadline(p_start_at, v_advance_notice_hours);
  v_reservation_status := case when now() > v_normal_deadline then 'PENDING_LATE'::public.reservation_status else 'PENDING'::public.reservation_status end;

  v_listing_exists := found;
  if not v_listing_exists then raise exception 'Listing not found'; end if;
  if v_listing_record_status = 'DELETED'::public.record_status then raise exception 'Listing not found'; end if;
  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then raise exception 'This listing is not available for booking yet'; end if;
  if v_listing_owner_id = v_uid then raise exception 'You cannot book your own listing'; end if;
  if v_late_deadline <= now() then raise exception 'This reservation can no longer be booked because the host response deadline has passed'; end if;

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text));

  if exists (
    select 1 from public.reservations r
    where r.listing_id = p_listing_id
      and r.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED')
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
    listing_id, renter_id, start_at, end_at, guests, status, payment_deadline
  ) values (
    p_listing_id, v_uid, p_start_at, p_end_at, p_guests, v_reservation_status,
    case when v_reservation_status = 'PENDING_LATE' then v_late_deadline else v_normal_deadline end
  ) returning * into result;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_uid then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      case when result.status = 'PENDING_LATE' then 'New late reservation request' else 'New reservation request' end,
      format(
        '%s has a new%s reservation request. Confirm it by %s or it will be cancelled.',
        coalesce(v_listing_title, 'Your listing'),
        case when result.status = 'PENDING_LATE' then ' late' else '' end,
        to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
      ),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', p_listing_id, 'payment_deadline', result.payment_deadline, 'is_late', result.status = 'PENDING_LATE')
    );
  end if;

  if v_instant_booking and v_rules_passed then
    select * into result
    from public.confirm_reservation_internal(result.id, false);
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

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
  v_host_confirmation_message text;
  v_chat jsonb;
  v_chat_id uuid;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Authentication required'; end if;

  select l.owner_id, r.end_at, r.payment_deadline, r.renter_id, r.listing_id, l.host_confirmation_message, l.title
  into v_owner_id, v_end_at, v_payment_deadline, v_renter_id, v_listing_id, v_host_confirmation_message, v_listing_title
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id
    and l.status = 'ACTIVE'::public.record_status;

  if v_owner_id is null then raise exception 'Reservation not found'; end if;
  if p_require_owner and not public.current_user_can_manage_listing(v_listing_id) then
    raise exception 'Only the listing owner or an admin can confirm this reservation';
  end if;
  if v_end_at <= now() then raise exception 'Past reservations cannot be confirmed'; end if;
  if v_payment_deadline <= now() then raise exception 'This reservation expired before it was confirmed'; end if;

  update public.reservations r
  set status = 'CONFIRMED'
  where r.id = p_reservation_id
    and r.status in ('PENDING', 'PENDING_LATE')
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already confirmed or cancelled';
  end if;

  if v_renter_id is not null and v_renter_id <> v_owner_id then
    perform public.create_notification(
      v_renter_id,
      'reservation_confirmed',
      'Reservation confirmed',
      format('Your reservation for %s has been confirmed.', coalesce(v_listing_title, 'this listing')),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id)
    );
  end if;

  if btrim(coalesce(v_host_confirmation_message, '')) <> '' and v_renter_id is distinct from v_owner_id then
    v_chat := public.create_direct_chat(v_renter_id, v_listing_id);
    v_chat_id := nullif(v_chat ->> 'id', '')::uuid;
    if v_chat_id is not null then
      insert into public.chat_messages (sender_id, chat_id, contents)
      values (v_owner_id, v_chat_id, btrim(v_host_confirmation_message));
    end if;
  end if;

  return result;
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
  v_late_deadline timestamptz;
  v_reservation_status public.reservation_status := 'PENDING'::public.reservation_status;
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
  v_late_deadline := public.calculate_reservation_late_booking_deadline(v_hold.start_at, v_advance_notice_hours);
  v_reservation_status := case when now() > v_normal_deadline then 'PENDING_LATE'::public.reservation_status else 'PENDING'::public.reservation_status end;

  if v_listing_owner_id is null then raise exception 'Listing not found'; end if;
  if v_listing_record_status = 'DELETED'::public.record_status then raise exception 'Listing not found'; end if;
  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then raise exception 'This listing is not available for booking yet'; end if;
  if v_late_deadline <= now() then raise exception 'This reservation can no longer be booked because the host response deadline has passed'; end if;

  perform pg_advisory_xact_lock(hashtext(v_hold.listing_id::text));

  if exists (
    select 1 from public.reservations r
    where r.listing_id = v_hold.listing_id
      and r.status in ('PENDING', 'PENDING_LATE', 'CONFIRMED')
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(v_hold.start_at, v_hold.end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  insert into public.reservations (
    listing_id, renter_id, start_at, end_at, guests, status, payment_deadline
  ) values (
    v_hold.listing_id, v_hold.renter_id, v_hold.start_at, v_hold.end_at, v_hold.guests, v_reservation_status,
    case when v_reservation_status = 'PENDING_LATE' then v_late_deadline else v_normal_deadline end
  ) returning * into result;

  update public.checkout_holds
  set status = 'COMPLETED'::public.checkout_hold_status,
      reservation_id = result.id
  where id = v_hold.id;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_hold.renter_id then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      case when result.status = 'PENDING_LATE' then 'New late reservation request' else 'New reservation request' end,
      format(
        '%s has a new%s paid reservation request. Confirm it by %s or it will be cancelled.',
        coalesce(v_listing_title, 'Your listing'),
        case when result.status = 'PENDING_LATE' then ' late' else '' end,
        to_char(result.payment_deadline at time zone 'UTC', 'Mon DD, YYYY HH24:MI UTC')
      ),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_hold.listing_id, 'payment_deadline', result.payment_deadline, 'is_late', result.status = 'PENDING_LATE')
    );
  end if;

  return to_jsonb(result);
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
      where r.status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status)
        and r.payment_deadline <= now()
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
      'payment_deadline_passed'
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
  set is_read = true,
      read_at = coalesce(n.read_at, now())
  where n.type = 'pending_reservation_review_reminder'
    and n.entity_type = 'reservation'
    and not n.is_read
    and not exists (
      select 1 from public.reservations r
      where r.id::text = n.entity_id
        and r.status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status)
        and r.payment_deadline > now()
    );

  for v_prompt in
    select
      r.id as reservation_id,
      r.listing_id,
      l.owner_id,
      l.title as listing_title,
      r.start_at,
      r.renter_id,
      r.status,
      r.payment_deadline as review_deadline
    from public.reservations r
    join public.listings l on l.id = r.listing_id
    where r.status in ('PENDING'::public.reservation_status, 'PENDING_LATE'::public.reservation_status)
      and l.owner_id is not null
      and r.payment_deadline > now()
      and now() >= r.payment_deadline - interval '30 minutes'
      and not exists (
        select 1 from public.notifications n
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
        case when v_prompt.status = 'PENDING_LATE' then 'Review late reservation request' else 'Review pending reservation' end,
        format(
          'A%s reservation request for %s will be cancelled if you do not confirm it by the payment deadline.',
          case when v_prompt.status = 'PENDING_LATE' then ' late' else '' end,
          coalesce(v_prompt.listing_title, 'your listing')
        ),
        '/reservation/' || v_prompt.reservation_id::text,
        'reservation',
        v_prompt.reservation_id::text,
        jsonb_build_object(
          'reservation_id', v_prompt.reservation_id,
          'listing_id', v_prompt.listing_id,
          'renter_id', v_prompt.renter_id,
          'start_at', v_prompt.start_at,
          'payment_deadline', v_prompt.review_deadline,
          'is_late', v_prompt.status = 'PENDING_LATE',
          'reminder_type', 'host_review_before_payment_deadline'
        )
      );
      v_created_count := v_created_count + 1;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_created_count;
end;
$function$;
