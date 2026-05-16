create table if not exists public.user_notification_preferences (
  user_id uuid not null references public."user"(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'push')),
  category text not null check (category in (
    'account_activity',
    'listing_activity',
    'reminders',
    'messages',
    'marketing'
  )),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel, category)
);

create index if not exists idx_user_notification_preferences_lookup
  on public.user_notification_preferences (user_id, channel, category);

insert into public.user_notification_preferences (
  user_id,
  channel,
  category,
  enabled
)
select
  u.id,
  'email',
  category.category,
  case
    when category.category = 'marketing' then false
    else coalesce(u.email_notifications_enabled, true)
  end
from public."user" u
cross join (
  values
    ('account_activity'),
    ('listing_activity'),
    ('reminders'),
    ('messages'),
    ('marketing')
) as category(category)
on conflict (user_id, channel, category) do nothing;

create or replace function public.notification_preference_default(
  p_channel text,
  p_category text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_category = 'marketing' then
    return false;
  end if;

  if p_channel = 'email' then
    return true;
  end if;

  return false;
end;
$function$;

create or replace function public.user_notification_preference_enabled(
  p_user_id uuid,
  p_channel text,
  p_category text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean;
begin
  if p_user_id is null then
    return true;
  end if;

  select pref.enabled
  into v_enabled
  from public.user_notification_preferences pref
  where pref.user_id = p_user_id
    and pref.channel = p_channel
    and pref.category = p_category;

  if v_enabled is null then
    return public.notification_preference_default(p_channel, p_category);
  end if;

  return v_enabled;
end;
$function$;

create or replace function public.email_notifications_enabled_for_job(
  p_user_id uuid,
  p_job_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category text;
begin
  case p_job_type
    when 'listing_created', 'listing_status_changed' then
      v_category := 'listing_activity';
    when 'review_reminder' then
      v_category := 'reminders';
    when 'chat_message' then
      v_category := 'messages';
    when 'reservation_created',
      'reservation_status_changed',
      'host_payout_setup_needed',
      'review_received',
      'late_reservation_status_changed'
    then
      v_category := 'account_activity';
    else
      return true;
  end case;

  return public.user_notification_preference_enabled(
    p_user_id,
    'email',
    v_category
  );
end;
$function$;

create or replace function public.get_email_notification_settings()
returns jsonb
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

  return jsonb_build_object(
    'email_account_activity_enabled', public.user_notification_preference_enabled(v_uid, 'email', 'account_activity'),
    'email_listing_activity_enabled', public.user_notification_preference_enabled(v_uid, 'email', 'listing_activity'),
    'email_reminders_enabled', public.user_notification_preference_enabled(v_uid, 'email', 'reminders'),
    'email_messages_enabled', public.user_notification_preference_enabled(v_uid, 'email', 'messages')
  );
end;
$function$;

create or replace function public.update_email_notification_settings(
  p_email_account_activity_enabled boolean,
  p_email_listing_activity_enabled boolean,
  p_email_reminders_enabled boolean,
  p_email_messages_enabled boolean
)
returns jsonb
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

  insert into public.user_notification_preferences (user_id, channel, category, enabled)
  values
    (v_uid, 'email', 'account_activity', p_email_account_activity_enabled),
    (v_uid, 'email', 'listing_activity', p_email_listing_activity_enabled),
    (v_uid, 'email', 'reminders', p_email_reminders_enabled),
    (v_uid, 'email', 'messages', p_email_messages_enabled)
  on conflict (user_id, channel, category) do update
  set
    enabled = excluded.enabled,
    updated_at = now();

  return jsonb_build_object(
    'email_account_activity_enabled', p_email_account_activity_enabled,
    'email_listing_activity_enabled', p_email_listing_activity_enabled,
    'email_reminders_enabled', p_email_reminders_enabled,
    'email_messages_enabled', p_email_messages_enabled
  );
end;
$function$;

grant execute on function public.notification_preference_default(text, text) to authenticated, service_role;
grant execute on function public.user_notification_preference_enabled(uuid, text, text) to authenticated, service_role;
grant execute on function public.email_notifications_enabled_for_job(uuid, text) to authenticated, service_role;
grant execute on function public.get_email_notification_settings() to authenticated, service_role;
grant execute on function public.update_email_notification_settings(boolean, boolean, boolean, boolean) to authenticated, service_role;

create or replace function public.enqueue_email(
  p_job_type text,
  p_recipient_role text,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_payload jsonb,
  p_dedupe_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
begin
  if p_recipient_user_id is not null and not public.email_notifications_enabled_for_job(p_recipient_user_id, p_job_type) then
    return;
  end if;

  insert into public.email_dispatch_keys (
    dedupe_key
  )
  values (
    p_dedupe_key
  )
  on conflict (dedupe_key) do nothing;

  if not found then
    return;
  end if;

  perform pgmq_public.send(
    'emails_queue',
    jsonb_build_object(
      'dedupe_key', p_dedupe_key,
      'job_type', p_job_type,
      'recipient_role', p_recipient_role,
      'recipient_user_id', p_recipient_user_id,
      'recipient_email', p_recipient_email,
      'payload', p_payload
    ),
    0
  );
end;
$function$;
