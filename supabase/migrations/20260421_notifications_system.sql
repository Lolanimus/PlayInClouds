do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'realtime_events'
      and n.nspname = 'public'
  ) then
    alter type public.realtime_events add value if not exists 'notifications_update';
  end if;
end
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."user"(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  action_url text,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created_at
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, is_read, created_at desc);

create unique index if not exists idx_notifications_review_reminder_unique
  on public.notifications (user_id, type, entity_id)
  where type = 'review_reminder'
    and entity_type = 'reservation';

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated, service_role;

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_broadcast boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notification public.notifications%rowtype;
begin
  if p_user_id is null then
    raise exception 'Notification user is required';
  end if;

  if btrim(coalesce(p_type, '')) = '' then
    raise exception 'Notification type is required';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Notification title is required';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    payload
  ) values (
    p_user_id,
    btrim(p_type),
    btrim(p_title),
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_action_url, '')), ''),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning * into v_notification;

  if p_broadcast then
    perform realtime.send(
      to_jsonb(v_notification),
      'notifications_update',
      'notifications:' || p_user_id::text,
      true
    );
  end if;

  return to_jsonb(v_notification);
end;
$function$;

create or replace function public.sync_review_reminder_notifications(
  p_user_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_created_count integer := 0;
  v_prompt record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  with eligible as (
    select
      r.id as reservation_id,
      r.listing_id,
      case
        when r.renter_id = v_uid then 'BOOKER_TO_HOST'::public.reservation_review_role
        else 'HOST_TO_BOOKER'::public.reservation_review_role
      end as reviewer_role,
      case
        when r.renter_id = v_uid then l.owner_id
        else r.renter_id
      end as reviewee_user_id
    from public.reservations r
    join public.listings l on l.id = r.listing_id
    where r.status = 'CONFIRMED'::public.reservation_status
      and r.end_at <= now()
      and r.end_at > now() - interval '14 days'
      and (r.renter_id = v_uid or l.owner_id = v_uid)
  )
  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = v_uid
    and n.type = 'review_reminder'
    and n.entity_type = 'reservation'
    and not n.is_read
    and not exists (
      select 1
      from eligible e
      where e.reservation_id::text = n.entity_id
        and e.reviewee_user_id is not null
        and e.reviewee_user_id <> v_uid
        and e.reviewer_role::text = coalesce(n.payload ->> 'reviewer_role', '')
        and not exists (
          select 1
          from public.reservation_reviews rr
          where rr.reviewer_user_id = v_uid
            and rr.reservation_id = e.reservation_id
            and rr.reviewer_role = e.reviewer_role
        )
        and not exists (
          select 1
          from public.reservation_reviews rr
          where rr.reviewer_user_id = v_uid
            and (
              (e.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
                and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
                and rr.listing_id = e.listing_id)
              or
              (e.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
                and rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
                and rr.reviewee_user_id = e.reviewee_user_id)
            )
        )
    );

  for v_prompt in
    with eligible as (
      select
        r.id as reservation_id,
        r.listing_id,
        l.title as listing_title,
        r.start_at,
        r.end_at,
        case
          when r.renter_id = v_uid then 'BOOKER_TO_HOST'::public.reservation_review_role
          else 'HOST_TO_BOOKER'::public.reservation_review_role
        end as reviewer_role,
        case
          when r.renter_id = v_uid then l.owner_id
          else r.renter_id
        end as reviewee_user_id,
        case
          when r.renter_id = v_uid then coalesce(nullif(trim(concat_ws(' ', owner_user.first_name, owner_user.last_name)), ''), 'Host')
          else coalesce(nullif(trim(concat_ws(' ', renter_user.first_name, renter_user.last_name)), ''), 'Guest')
        end as reviewee_display_name,
        r.end_at + interval '14 days' as expires_at
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      left join public."user" owner_user on owner_user.id = l.owner_id
      left join public."user" renter_user on renter_user.id = r.renter_id
      where r.status = 'CONFIRMED'::public.reservation_status
        and r.end_at <= now()
        and r.end_at > now() - interval '14 days'
        and (r.renter_id = v_uid or l.owner_id = v_uid)
    )
    select
      e.reservation_id,
      e.listing_id,
      e.listing_title,
      e.reviewer_role,
      e.reviewee_user_id,
      e.reviewee_display_name,
      e.expires_at
    from eligible e
    where e.reviewee_user_id is not null
      and e.reviewee_user_id <> v_uid
      and not exists (
        select 1
        from public.reservation_reviews rr
        where rr.reviewer_user_id = v_uid
          and rr.reservation_id = e.reservation_id
          and rr.reviewer_role = e.reviewer_role
      )
      and not exists (
        select 1
        from public.reservation_reviews rr
        where rr.reviewer_user_id = v_uid
          and (
            (e.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
              and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role
              and rr.listing_id = e.listing_id)
            or
            (e.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
              and rr.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role
              and rr.reviewee_user_id = e.reviewee_user_id)
          )
      )
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = v_uid
          and n.type = 'review_reminder'
          and n.entity_type = 'reservation'
          and n.entity_id = e.reservation_id::text
      )
    order by e.end_at desc
  loop
    begin
      perform public.create_notification(
        v_uid,
        'review_reminder',
        case
          when v_prompt.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role then 'Leave a review for your guest'
          else 'Leave a review for your host'
        end,
        case
          when v_prompt.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role then
            format('Your session for %s has ended. Share feedback for %s.', coalesce(v_prompt.listing_title, 'this listing'), v_prompt.reviewee_display_name)
          else
            format('Your reservation for %s has ended. Share feedback for %s.', coalesce(v_prompt.listing_title, 'this listing'), v_prompt.reviewee_display_name)
        end,
        '/reservation/' || v_prompt.reservation_id::text || '?leaveReview=1',
        'reservation',
        v_prompt.reservation_id::text,
        jsonb_build_object(
          'reservation_id', v_prompt.reservation_id,
          'listing_id', v_prompt.listing_id,
          'reviewer_role', v_prompt.reviewer_role,
          'reviewee_user_id', v_prompt.reviewee_user_id,
          'reviewee_display_name', v_prompt.reviewee_display_name,
          'expires_at', v_prompt.expires_at
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

create or replace function public.list_notifications(
  p_limit integer default 20,
  p_offset integer default 0
) returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_review_reminder_notifications(v_uid);

  return query
  select to_jsonb(n)
  from public.notifications n
  where n.user_id = v_uid
  order by n.created_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

create or replace function public.count_unread_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_review_reminder_notifications(v_uid);

  select count(*)::integer
  into v_count
  from public.notifications n
  where n.user_id = v_uid
    and not n.is_read;

  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.mark_notification_read(
  p_notification_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_notification public.notifications%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.user_id = v_uid
  returning * into v_notification;

  if v_notification.id is null then
    raise exception 'Notification not found';
  end if;

  return to_jsonb(v_notification);
end;
$function$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = v_uid
    and not n.is_read;

  get diagnostics v_count = row_count;

  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.approve_listing(
  p_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  result public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.listings l
  set
    moderation_status = 'APPROVED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  if result.owner_id is not null then
    perform public.create_notification(
      result.owner_id,
      'listing_approved',
      'Listing approved',
      format('%s is now live on AirDrums.', result.title),
      '/host/dashboard',
      'listing',
      result.id::text,
      jsonb_build_object('listing_id', result.id, 'moderation_status', result.moderation_status)
    );
  end if;

  return to_jsonb(result);
end;
$function$;

create or replace function public.reject_listing(
  p_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  result public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.listings l
  set
    moderation_status = 'REJECTED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  if result.owner_id is not null then
    perform public.create_notification(
      result.owner_id,
      'listing_rejected',
      'Listing rejected',
      coalesce(nullif(result.moderation_message, ''), format('%s needs updates before it can go live.', result.title)),
      '/host/edit-listing/' || result.id::text,
      'listing',
      result.id::text,
      jsonb_build_object('listing_id', result.id, 'moderation_status', result.moderation_status)
    );
  end if;

  return to_jsonb(result);
end;
$function$;

create or replace function public.create_message(p_chat_id uuid, p_contents text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_sender_id uuid := auth.uid();
  v_sender_name text;
  v_chat public.chats%rowtype;
  v_listing public.listings%rowtype;
  participant_record record;
begin
  if v_sender_id is null then
    raise exception 'Authentication required';
  end if;

  if p_contents is null or p_contents = '' then
    raise exception 'Can''t create an empty message';
  end if;

  select *
  into v_chat
  from public.chats c
  where c.id = p_chat_id;

  if v_chat.id is null then
    raise exception 'Chat not found';
  end if;

  if not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.participant_id = v_sender_id
  ) then
    raise exception 'Only chat participants can send messages';
  end if;

  select coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Someone')
  into v_sender_name
  from public."user" u
  where u.id = v_sender_id;

  if v_chat.listing_id is not null then
    select *
    into v_listing
    from public.listings l
    where l.id = v_chat.listing_id;
  end if;

  insert into public.chat_messages (sender_id, chat_id, contents)
  values (v_sender_id, p_chat_id, p_contents)
  returning jsonb_build_object(
    'id', id,
    'sender_id', sender_id,
    'chat_id', chat_id,
    'contents', contents,
    'created_at', created_at
  ) into v_result;

  for participant_record in
    select cp.participant_id
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.participant_id <> v_sender_id
  loop
    perform public.create_notification(
      participant_record.participant_id,
      'chat_message',
      case
        when v_listing.id is not null then format('New message about %s', v_listing.title)
        else 'New chat message'
      end,
      format('%s: %s', v_sender_name, left(p_contents, 120)),
      '/chat',
      'chat',
      p_chat_id::text,
      jsonb_build_object(
        'chat_id', p_chat_id,
        'listing_id', v_chat.listing_id,
        'sender_id', v_sender_id
      )
    );
  end loop;

  return v_result;
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
  v_listing_owner_id uuid;
  v_listing_title text;
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

  select l.owner_id, l.moderation_status, l.title
  into v_listing_owner_id, v_listing_status, v_listing_title
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

  insert into public.reservations (listing_id, renter_id, start_at, end_at, guests, status)
  values (p_listing_id, v_uid, p_start_at, p_end_at, p_guests, 'PENDING')
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

create or replace function public.confirm_reservation_internal(
  p_reservation_id uuid,
  p_require_owner boolean default true
) returns public.reservations as $function$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_end_at timestamptz;
  v_renter_id uuid;
  v_listing_id uuid;
  v_listing_title text;
  v_host_confirmation_message text;
  v_chat jsonb;
  v_chat_id uuid;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select l.owner_id, r.end_at, r.renter_id, r.listing_id, l.host_confirmation_message, l.title
  into v_owner_id, v_end_at, v_renter_id, v_listing_id, v_host_confirmation_message, v_listing_title
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if p_require_owner and not public.current_user_can_manage_listing(v_listing_id) then
    raise exception 'Only the listing owner or an admin can confirm this reservation';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be confirmed';
  end if;

  update public.reservations r
  set status = 'CONFIRMED'
  where r.id = p_reservation_id
    and r.status = 'PENDING'
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
  v_cancellation_policy_hours integer;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.renter_id, l.owner_id, r.listing_id, l.title, r.start_at, r.end_at, l.cancellation_policy_hours
  into v_renter_id, v_owner_id, v_listing_id, v_listing_title, v_start_at, v_end_at, v_cancellation_policy_hours
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_renter_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_uid <> v_renter_id and v_uid <> v_owner_id then
    raise exception 'Only renter or listing owner can cancel this reservation';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be cancelled';
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

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

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
  v_review_reminder_updates integer := 0;
  v_result public.reservation_reviews%rowtype;
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

  if exists (
    select 1
    from public.reservation_reviews rr
    where rr.reviewer_user_id = v_uid
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

  insert into public.reservation_reviews (
    reservation_id,
    listing_id,
    reviewer_user_id,
    reviewee_user_id,
    reviewer_role,
    rating,
    text
  ) values (
    v_reservation.id,
    v_reservation.listing_id,
    v_uid,
    v_reviewee_user_id,
    v_reviewer_role,
    p_rating,
    btrim(p_text)
  )
  returning * into v_result;

  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = v_uid
    and n.type = 'review_reminder'
    and n.entity_type = 'reservation'
    and n.entity_id = v_reservation.id::text
    and coalesce(n.payload ->> 'reviewer_role', '') = v_reviewer_role::text
    and not n.is_read;

  get diagnostics v_review_reminder_updates = row_count;

  if v_review_reminder_updates > 0 then
    perform realtime.send(
      jsonb_build_object(
        'type', 'review_reminder_read',
        'reservation_id', v_reservation.id,
        'reviewer_role', v_reviewer_role
      ),
      'notifications_update',
      'notifications:' || v_uid::text,
      true
    );
  end if;

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
    jsonb_build_object('review_id', v_result.id, 'reservation_id', v_reservation.id)
  );

  return to_jsonb(v_result);
end;
$function$;

grant execute on function public.sync_review_reminder_notifications(uuid) to authenticated, service_role;
grant execute on function public.list_notifications(integer, integer) to authenticated, service_role;
grant execute on function public.count_unread_notifications() to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;
