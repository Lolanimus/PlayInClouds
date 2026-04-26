alter table public.reservations
  add column if not exists confirm_by_at timestamptz;

update public.reservations r
set confirm_by_at = public.calculate_advance_notice_start_at(
  coalesce(l.timezone, 'UTC'),
  l.advance_notice_hours,
  coalesce(r.created_at::timestamptz, now())
)
from public.listings l
where l.id = r.listing_id
  and r.status = 'PENDING'::public.reservation_status
  and r.confirm_by_at is null;

create index if not exists idx_reservations_pending_confirm_by_at
  on public.reservations (confirm_by_at, start_at)
  where status = 'PENDING'::public.reservation_status;

create unique index if not exists idx_notifications_pending_reservation_review_unique
  on public.notifications (user_id, type, entity_id)
  where type = 'pending_reservation_review_reminder'
    and entity_type = 'reservation';

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
  v_listing_owner_id uuid;
  v_listing_title text;
  v_confirm_by_at timestamptz;
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
    l.title,
    public.calculate_advance_notice_start_at(
      coalesce(l.timezone, 'UTC'),
      l.advance_notice_hours,
      now()
    )
  into v_listing_owner_id, v_listing_status, v_listing_title, v_confirm_by_at
  from public.listings l
  where l.id = p_listing_id;

  v_listing_exists := found;

  if not v_listing_exists then
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
    confirm_by_at
  )
  values (
    p_listing_id,
    v_uid,
    p_start_at,
    p_end_at,
    p_guests,
    'PENDING',
    v_confirm_by_at
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

create or replace function public.notify_auto_cancelled_pending_reservation(
  p_reservation_id uuid,
  p_renter_id uuid,
  p_owner_id uuid,
  p_listing_id uuid,
  p_listing_title text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'advance_notice_window_passed');
  v_host_body text;
  v_renter_body text;
begin
  v_host_body := case
    when v_reason = 'start_time_passed' then
      format('The pending reservation request for %s was automatically cancelled because its start time passed before it was reviewed.', coalesce(p_listing_title, 'your listing'))
    else
      format('The pending reservation request for %s was automatically cancelled because it was not confirmed before the advance-notice deadline.', coalesce(p_listing_title, 'your listing'))
  end;

  v_renter_body := case
    when v_reason = 'start_time_passed' then
      format('Your reservation request for %s expired because its start time passed before it was confirmed.', coalesce(p_listing_title, 'this listing'))
    else
      format('Your reservation request for %s expired because it was not confirmed before the advance-notice deadline.', coalesce(p_listing_title, 'this listing'))
  end;

  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = p_owner_id
    and n.type = 'pending_reservation_review_reminder'
    and n.entity_type = 'reservation'
    and n.entity_id = p_reservation_id::text
    and not n.is_read;

  if p_renter_id is not null then
    perform public.create_notification(
      p_renter_id,
      'reservation_auto_cancelled',
      'Reservation request expired',
      v_renter_body,
      '/reservation/' || p_reservation_id::text,
      'reservation',
      p_reservation_id::text,
      jsonb_build_object(
        'reservation_id', p_reservation_id,
        'listing_id', p_listing_id,
        'reason', v_reason
      )
    );
  end if;

  if p_owner_id is not null then
    perform public.create_notification(
      p_owner_id,
      'reservation_auto_cancelled',
      'Pending reservation expired',
      v_host_body,
      '/reservation/' || p_reservation_id::text,
      'reservation',
      p_reservation_id::text,
      jsonb_build_object(
        'reservation_id', p_reservation_id,
        'listing_id', p_listing_id,
        'reason', v_reason
      )
    );
  end if;
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
      where r.status = 'PENDING'::public.reservation_status
        and (
          r.start_at <= now()
          or (r.confirm_by_at is not null and r.start_at < r.confirm_by_at)
        )
      returning r.id, r.renter_id, r.listing_id, r.start_at, r.confirm_by_at
    )
    select
      u.id,
      u.renter_id,
      l.owner_id,
      u.listing_id,
      l.title as listing_title,
      u.start_at,
      u.confirm_by_at
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
        and r.start_at > now()
        and (r.confirm_by_at is null or r.start_at >= r.confirm_by_at)
    );

  for v_prompt in
    select
      r.id as reservation_id,
      r.listing_id,
      l.owner_id,
      l.title as listing_title,
      r.start_at,
      r.renter_id,
      r.confirm_by_at
    from public.reservations r
    join public.listings l on l.id = r.listing_id
    where r.status = 'PENDING'::public.reservation_status
      and l.owner_id is not null
      and r.start_at > now()
      and r.start_at <= now() + interval '30 minutes'
      and (r.confirm_by_at is null or r.start_at >= r.confirm_by_at)
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
        format('A reservation request for %s starts in less than 30 minutes. Review it now before it expires.', coalesce(v_prompt.listing_title, 'your listing')),
        '/reservation/' || v_prompt.reservation_id::text,
        'reservation',
        v_prompt.reservation_id::text,
        jsonb_build_object(
          'reservation_id', v_prompt.reservation_id,
          'listing_id', v_prompt.listing_id,
          'renter_id', v_prompt.renter_id,
          'start_at', v_prompt.start_at,
          'confirm_by_at', v_prompt.confirm_by_at,
          'reminder_type', 'host_review_before_start'
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

create extension if not exists pg_cron;

do $do$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'auto-cancel-started-pending-reservations'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'auto-cancel-started-pending-reservations',
    '* * * * *',
    $job$
      select public.auto_cancel_pending_reservations_for_advance_notice();
    $job$
  );
end;
$do$;

do $do$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'notify-hosts-to-review-pending-reservations'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'notify-hosts-to-review-pending-reservations',
    '* * * * *',
    $job$
      select public.sync_pending_reservation_review_notifications();
    $job$
  );
end;
$do$;

revoke all on function public.notify_auto_cancelled_pending_reservation(uuid, uuid, uuid, uuid, text, text) from public, authenticated;
revoke all on function public.auto_cancel_pending_reservations_for_advance_notice() from public, authenticated;
revoke all on function public.sync_pending_reservation_review_notifications() from public, authenticated;

grant execute on function public.notify_auto_cancelled_pending_reservation(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.auto_cancel_pending_reservations_for_advance_notice() to service_role;
grant execute on function public.sync_pending_reservation_review_notifications() to service_role;
