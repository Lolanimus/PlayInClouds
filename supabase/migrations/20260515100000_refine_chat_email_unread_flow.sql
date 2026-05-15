alter table public.chat_email_pending
  add column if not exists email_sent boolean not null default false;

update public.chat_email_pending
set email_sent = coalesce(email_sent, false)
where true;

create or replace function public.create_message(p_chat_id uuid, p_contents text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_message_id uuid;
  v_message_created_at timestamptz;
  v_uid uuid := auth.uid()::uuid;
  v_chat_is_visible boolean := false;
  v_recipient record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_contents is null or p_contents = '' then
    raise exception 'Can''t create an empty message';
  end if;

  select exists (
    select 1
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.id = p_chat_id
      and cp.participant_id = v_uid
      and c.status = 'ACTIVE'::public.record_status
      and (
        c.listing_id is null
        or exists (
          select 1 from public.listings l
          where l.id = c.listing_id
            and l.status = 'ACTIVE'::public.record_status
        )
      )
      and not exists (
        select 1
        from public.chat_participants cp_hidden
        where cp_hidden.chat_id = c.id
          and not public.current_user_can_view_user(cp_hidden.participant_id)
      )
  ) into v_chat_is_visible;

  if not v_chat_is_visible then
    raise exception 'Chat not found';
  end if;

  insert into public.chat_messages (sender_id, chat_id, contents, status)
  values (v_uid, p_chat_id, p_contents, 'ACTIVE'::public.record_status)
  returning
    id,
    created_at,
    jsonb_build_object(
      'id', id,
      'sender_id', sender_id,
      'chat_id', chat_id,
      'contents', contents,
      'created_at', created_at,
      'status', status
    )
  into v_message_id, v_message_created_at, v_result;

  for v_recipient in
    select cp.participant_id
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.participant_id <> v_uid
  loop
    insert into public.chat_email_pending (
      chat_id,
      recipient_user_id,
      message_count,
      last_message_id,
      last_message_at,
      email_sent,
      created_at,
      updated_at
    )
    values (
      p_chat_id,
      v_recipient.participant_id,
      1,
      v_message_id,
      v_message_created_at,
      false,
      now(),
      now()
    )
    on conflict (chat_id, recipient_user_id) do update
    set
      message_count = public.chat_email_pending.message_count + 1,
      last_message_id = excluded.last_message_id,
      last_message_at = excluded.last_message_at,
      updated_at = now();
  end loop;

  return v_result;
end;
$function$;

create or replace function public.get_messages(p_chat_id uuid, p_cursor integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_messages jsonb;
  v_total_count int;
  v_next_cursor int;
  v_uid uuid := auth.uid()::uuid;
  v_chat_is_visible boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.id = p_chat_id
      and cp.participant_id = v_uid
      and c.status = 'ACTIVE'::public.record_status
      and not exists (
        select 1
        from public.chat_participants cp_hidden
        where cp_hidden.chat_id = c.id
          and not public.current_user_can_view_user(cp_hidden.participant_id)
      )
  ) into v_chat_is_visible;

  if not v_chat_is_visible then
    return jsonb_build_object(
      'messages', '[]'::jsonb,
      'nextCursor', null
    );
  end if;

  delete from public.chat_email_pending p
  where p.chat_id = p_chat_id
    and p.recipient_user_id = v_uid;

  select count(*) into v_total_count
  from public.chat_messages cm
  where cm.chat_id = p_chat_id
    and cm.status = 'ACTIVE'::public.record_status;

  if p_cursor + p_limit < v_total_count then
    v_next_cursor := p_cursor + p_limit;
  else
    v_next_cursor := null;
  end if;

  select jsonb_build_object(
    'messages', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'sender_id', m.sender_id,
          'chat_id', m.chat_id,
          'contents', m.contents,
          'created_at', m.created_at,
          'status', m.status
        ) order by m.created_at desc
      ),
      '[]'::jsonb
    ),
    'nextCursor', v_next_cursor
  ) into v_messages
  from (
    select cm.id, cm.sender_id, cm.chat_id, cm.contents, cm.created_at, cm.status
    from public.chat_messages cm
    where cm.chat_id = p_chat_id
      and cm.status = 'ACTIVE'::public.record_status
    order by cm.created_at desc
    offset p_cursor
    limit p_limit
  ) m;

  return v_messages;
end;
$function$;

create or replace function public.enqueue_chat_email()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prompt record;
  v_count integer := 0;
begin
  for v_prompt in
    select
      p.recipient_user_id,
      u.email as recipient_email,
      sum(p.message_count)::integer as message_count
    from public.chat_email_pending p
    join public."user" u on u.id = p.recipient_user_id
    left join public.chat_email_cooldowns c on c.recipient_user_id = p.recipient_user_id
    where p.message_count > 0
      and p.email_sent = false
      and u.email is not null
      and (
        c.recipient_user_id is null
        or c.cooldown_until is null
        or c.cooldown_until <= now()
      )
    group by p.recipient_user_id, u.email
  loop
    insert into public.chat_email_cooldowns (
      recipient_user_id,
      cooldown_until,
      last_sent_at,
      created_at,
      updated_at
    )
    values (
      v_prompt.recipient_user_id,
      now() + interval '30 minutes',
      now(),
      now(),
      now()
    )
    on conflict (recipient_user_id) do update
    set
      cooldown_until = excluded.cooldown_until,
      last_sent_at = excluded.last_sent_at,
      updated_at = now();

    perform public.enqueue_email(
      'chat_message',
      'recipient',
      v_prompt.recipient_user_id,
      v_prompt.recipient_email,
      jsonb_build_object(
        'message_count', v_prompt.message_count
      ),
      'chat-message-' || v_prompt.recipient_user_id::text || '-' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI')
    );

    update public.chat_email_pending p
    set
      email_sent = true,
      updated_at = now()
    where p.recipient_user_id = v_prompt.recipient_user_id
      and p.message_count > 0
      and p.email_sent = false;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
