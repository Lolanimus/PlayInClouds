create table if not exists public.user_notification_preferences (
  user_id uuid not null references public."user" (id) on delete cascade,
  channel text not null,
  category text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel, category),
  constraint user_notification_preferences_channel_check
    check (channel = 'email'),
  constraint user_notification_preferences_category_check
    check (category in ('account_activity', 'listing_activity', 'reminders', 'messages'))
);

alter table public.user_notification_preferences enable row level security;

drop policy if exists user_notification_preferences_select_own
  on public.user_notification_preferences;
create policy user_notification_preferences_select_own
  on public.user_notification_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_notification_preferences_insert_own
  on public.user_notification_preferences;
create policy user_notification_preferences_insert_own
  on public.user_notification_preferences
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_notification_preferences_update_own
  on public.user_notification_preferences;
create policy user_notification_preferences_update_own
  on public.user_notification_preferences
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.get_email_notification_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_settings jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'email_account_activity_enabled', coalesce(bool_or(p.enabled) filter (where p.category = 'account_activity'), true),
    'email_listing_activity_enabled', coalesce(bool_or(p.enabled) filter (where p.category = 'listing_activity'), true),
    'email_reminders_enabled', coalesce(bool_or(p.enabled) filter (where p.category = 'reminders'), true),
    'email_messages_enabled', coalesce(bool_or(p.enabled) filter (where p.category = 'messages'), true)
  )
  into v_settings
  from public.user_notification_preferences p
  where p.user_id = v_uid
    and p.channel = 'email';

  return v_settings;
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

  if p_email_account_activity_enabled is null
    or p_email_listing_activity_enabled is null
    or p_email_reminders_enabled is null
    or p_email_messages_enabled is null then
    raise exception 'Notification settings cannot be null';
  end if;

  if not exists (select 1 from public."user" u where u.id = v_uid) then
    raise exception 'User not found';
  end if;

  insert into public.user_notification_preferences (
    user_id,
    channel,
    category,
    enabled
  )
  values
    (v_uid, 'email', 'account_activity', p_email_account_activity_enabled),
    (v_uid, 'email', 'listing_activity', p_email_listing_activity_enabled),
    (v_uid, 'email', 'reminders', p_email_reminders_enabled),
    (v_uid, 'email', 'messages', p_email_messages_enabled)
  on conflict (user_id, channel, category)
  do update set
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

revoke all on table public.user_notification_preferences from anon;
grant select, insert, update on table public.user_notification_preferences to authenticated;
grant all on table public.user_notification_preferences to service_role;

revoke all on function public.get_email_notification_settings() from public;
revoke all on function public.update_email_notification_settings(boolean, boolean, boolean, boolean) from public;
grant execute on function public.get_email_notification_settings() to authenticated, service_role;
grant execute on function public.update_email_notification_settings(boolean, boolean, boolean, boolean) to authenticated, service_role;
