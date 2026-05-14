create table if not exists public.review_reminder_keys (
  recipient_user_id uuid not null references public."user"(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('booker', 'host')),
  listing_id uuid references public.listings(id) on delete cascade,
  reviewee_user_id uuid references public."user"(id) on delete cascade,
  notification_sent_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    reviewee_user_id is not null
    and (
      (recipient_role = 'booker' and listing_id is not null)
      or recipient_role = 'host'
    )
  )
);

create unique index if not exists review_reminder_keys_booker_unique
  on public.review_reminder_keys (recipient_user_id, listing_id)
  where recipient_role = 'booker';

create unique index if not exists review_reminder_keys_host_unique
  on public.review_reminder_keys (recipient_user_id, reviewee_user_id)
  where recipient_role = 'host';

create or replace function public.claim_review_reminder(
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_listing_id uuid,
  p_reviewee_user_id uuid,
  p_channel text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claimed boolean := false;
begin
  if p_recipient_role not in ('booker', 'host') then
    raise exception 'Unsupported recipient role for review reminder';
  end if;

  if p_channel not in ('notification', 'email') then
    raise exception 'Unsupported channel for review reminder';
  end if;

  if p_reviewee_user_id is null then
    raise exception 'Reviewee is required for review reminder';
  end if;

  if p_recipient_role = 'booker' and p_listing_id is null then
    raise exception 'Listing is required for a booker review reminder';
  end if;

  insert into public.review_reminder_keys (
    recipient_user_id,
    recipient_role,
    listing_id,
    reviewee_user_id
  )
  values (
    p_recipient_user_id,
    p_recipient_role,
    p_listing_id,
    p_reviewee_user_id
  )
  on conflict do nothing;

  if p_recipient_role = 'booker' then
    if p_channel = 'notification' then
      update public.review_reminder_keys k
      set notification_sent_at = now()
      where k.recipient_role = 'booker'
        and k.recipient_user_id = p_recipient_user_id
        and k.listing_id = p_listing_id
        and k.notification_sent_at is null
      returning true into v_claimed;
    else
      update public.review_reminder_keys k
      set email_sent_at = now()
      where k.recipient_role = 'booker'
        and k.recipient_user_id = p_recipient_user_id
        and k.listing_id = p_listing_id
        and k.email_sent_at is null
      returning true into v_claimed;
    end if;
  else
    if p_channel = 'notification' then
      update public.review_reminder_keys k
      set notification_sent_at = now()
      where k.recipient_role = 'host'
        and k.recipient_user_id = p_recipient_user_id
        and k.reviewee_user_id = p_reviewee_user_id
        and k.notification_sent_at is null
      returning true into v_claimed;
    else
      update public.review_reminder_keys k
      set email_sent_at = now()
      where k.recipient_role = 'host'
        and k.recipient_user_id = p_recipient_user_id
        and k.reviewee_user_id = p_reviewee_user_id
        and k.email_sent_at is null
      returning true into v_claimed;
    end if;
  end if;

  return coalesce(v_claimed, false);
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
  v_recipient_role text;
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
      and l.status = 'ACTIVE'::public.record_status
      and (r.renter_id = v_uid or l.owner_id = v_uid)
  )
  update public.notifications n
  set
    is_read = true,
    read_at = coalesce(n.read_at, now())
  where n.user_id = v_uid
    and n.type = 'review_reminder'
    and n.entity_type = 'reservation'
    and n.status = 'ACTIVE'::public.record_status
    and not n.is_read
    and not exists (
      select 1
      from eligible e
      where e.reservation_id::text = n.entity_id
        and e.reviewee_user_id is not null
        and e.reviewee_user_id <> v_uid
        and public.current_user_can_view_user(e.reviewee_user_id)
        and e.reviewer_role::text = coalesce(n.payload ->> 'reviewer_role', '')
        and public.can_leave_review(v_uid, e.reservation_id)
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
        and l.status = 'ACTIVE'::public.record_status
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
      and public.current_user_can_view_user(e.reviewee_user_id)
      and public.can_leave_review(v_uid, e.reservation_id)
    order by e.end_at desc
  loop
    v_recipient_role := case
      when v_prompt.reviewer_role = 'HOST_TO_BOOKER'::public.reservation_review_role then 'host'
      else 'booker'
    end;

    if public.claim_review_reminder(
      v_uid,
      v_recipient_role,
      v_prompt.listing_id,
      v_prompt.reviewee_user_id,
      'notification'
    ) then
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
    end if;
  end loop;

  return v_created_count;
end;
$function$;

create or replace function public.enqueue_review_reminder()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prompt record;
  v_created_count integer := 0;
begin
  for v_prompt in
    with eligible as (
      select
        r.id as reservation_id,
        r.listing_id,
        l.title as listing_title,
        coalesce(l.timezone, 'UTC') as listing_time_zone,
        r.start_at,
        r.end_at,
        r.end_at + interval '14 days' as expires_at,
        r.renter_id,
        renter.email as renter_email,
        renter.first_name as renter_first_name,
        renter.last_name as renter_last_name,
        l.owner_id as host_user_id,
        host.email as host_email,
        host.first_name as host_first_name,
        host.last_name as host_last_name
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      join public."user" renter on renter.id = r.renter_id
      join public."user" host on host.id = l.owner_id
      where r.status = 'CONFIRMED'::public.reservation_status
        and r.end_at <= now()
        and r.end_at > now() - interval '14 days'
        and l.status = 'ACTIVE'::public.record_status
    )
    select
      'booker'::text as recipient_role,
      e.renter_id as recipient_user_id,
      e.host_user_id as reviewee_user_id,
      e.renter_email as recipient_email,
      e.reservation_id,
      e.listing_id,
      e.listing_title,
      e.listing_time_zone,
      e.start_at,
      e.end_at,
      e.expires_at,
      e.renter_first_name,
      e.renter_last_name,
      e.host_first_name,
      e.host_last_name,
      'review-reminder-booker-' || e.renter_id::text || '-listing-' || e.listing_id::text as dedupe_key
    from eligible e
    where e.renter_email is not null
      and public.can_leave_review(e.renter_id, e.reservation_id)

    union all

    select
      'host'::text as recipient_role,
      e.host_user_id as recipient_user_id,
      e.renter_id as reviewee_user_id,
      e.host_email as recipient_email,
      e.reservation_id,
      e.listing_id,
      e.listing_title,
      e.listing_time_zone,
      e.start_at,
      e.end_at,
      e.expires_at,
      e.renter_first_name,
      e.renter_last_name,
      e.host_first_name,
      e.host_last_name,
      'review-reminder-host-' || e.host_user_id::text || '-guest-' || e.renter_id::text as dedupe_key
    from eligible e
    where e.host_email is not null
      and public.can_leave_review(e.host_user_id, e.reservation_id)
  loop
    if public.claim_review_reminder(
      v_prompt.recipient_user_id,
      v_prompt.recipient_role,
      v_prompt.listing_id,
      v_prompt.reviewee_user_id,
      'email'
    ) then
      perform public.enqueue_email(
        'review_reminder',
        v_prompt.recipient_role,
        v_prompt.recipient_user_id,
        v_prompt.recipient_email,
        jsonb_build_object(
          'reservation_id', v_prompt.reservation_id,
          'listing_id', v_prompt.listing_id,
          'listing_title', v_prompt.listing_title,
          'listing_time_zone', v_prompt.listing_time_zone,
          'start_at', v_prompt.start_at,
          'end_at', v_prompt.end_at,
          'expires_at', v_prompt.expires_at,
          'renter_first_name', v_prompt.renter_first_name,
          'renter_last_name', v_prompt.renter_last_name,
          'host_first_name', v_prompt.host_first_name,
          'host_last_name', v_prompt.host_last_name
        ),
        v_prompt.dedupe_key
      );

      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$function$;

grant execute on function public.claim_review_reminder(uuid, text, uuid, uuid, text) to authenticated, service_role;
