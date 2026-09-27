alter table public."user"
  add column if not exists email_notifications_enabled boolean;

update public."user"
set email_notifications_enabled = coalesce(email_notifications_enabled, true);

alter table public."user"
  alter column email_notifications_enabled set default true,
  alter column email_notifications_enabled set not null;

create or replace function public.get_email_notification_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_enabled boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select u.email_notifications_enabled
  into v_enabled
  from public."user" u
  where u.id = v_uid;

  if v_enabled is null then
    v_enabled := true;
  end if;

  return jsonb_build_object(
    'email_notifications_enabled', v_enabled
  );
end;
$function$;

create or replace function public.update_email_notification_settings(
  p_email_notifications_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_enabled boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  update public."user" u
  set
    email_notifications_enabled = p_email_notifications_enabled,
    updated_at = now()
  where u.id = v_uid
  returning u.email_notifications_enabled into v_enabled;

  if v_enabled is null then
    raise exception 'User not found';
  end if;

  return jsonb_build_object(
    'email_notifications_enabled', v_enabled
  );
end;
$function$;

grant execute on function public.get_email_notification_settings() to authenticated, service_role;
grant execute on function public.update_email_notification_settings(boolean) to authenticated, service_role;

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
  v_email_notifications_enabled boolean := true;
begin
  if p_recipient_user_id is not null then
    select u.email_notifications_enabled
    into v_email_notifications_enabled
    from public."user" u
    where u.id = p_recipient_user_id;

    v_email_notifications_enabled := coalesce(v_email_notifications_enabled, true);

    if not v_email_notifications_enabled then
      return;
    end if;
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
