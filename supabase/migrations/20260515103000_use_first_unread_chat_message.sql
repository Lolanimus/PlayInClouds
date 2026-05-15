alter table public.chat_email_pending
  add column if not exists first_message_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists first_message_at timestamptz,
  add column if not exists first_message_preview text;

update public.chat_email_pending
set
  first_message_id = coalesce(first_message_id, last_message_id),
  first_message_at = coalesce(first_message_at, last_message_at),
  first_message_preview = coalesce(first_message_preview, '')
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
  v_message_preview text;
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

  v_message_preview := left(btrim(p_contents), 120);

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
      first_message_id,
      first_message_at,
      first_message_preview,
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
      v_message_id,
      v_message_created_at,
      v_message_preview,
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
    with eligible_pending as (
      select
        p.chat_id,
        p.recipient_user_id,
        p.first_message_at,
        p.first_message_preview
      from public.chat_email_pending p
      left join public.chat_email_cooldowns c
        on c.recipient_user_id = p.recipient_user_id
      join public."user" u
        on u.id = p.recipient_user_id
      where p.message_count > 0
        and p.email_sent = false
        and u.email is not null
        and (
          c.recipient_user_id is null
          or c.cooldown_until is null
          or c.cooldown_until <= now()
        )
    ),
    conversation_rows as (
      select
        ep.recipient_user_id,
        u.email as recipient_email,
        ep.chat_id,
        ep.first_message_at,
        ep.first_message_preview,
        c.listing_id,
        l.title as listing_title,
        other_user.id as counterparty_user_id,
        coalesce(
          nullif(trim(concat_ws(' ', other_user.first_name, other_user.last_name)), ''),
          'Someone'
        ) as counterparty_name
      from eligible_pending ep
      join public."user" u
        on u.id = ep.recipient_user_id
      join public.chats c
        on c.id = ep.chat_id
      left join public.listings l
        on l.id = c.listing_id
      join public.chat_participants cp_other
        on cp_other.chat_id = ep.chat_id
       and cp_other.participant_id <> ep.recipient_user_id
      join public."user" other_user
        on other_user.id = cp_other.participant_id
    ),
    ranked_conversations as (
      select
        cr.*,
        row_number() over (
          partition by cr.recipient_user_id
          order by cr.first_message_at desc
        ) as rn
      from conversation_rows cr
    ),
    recipient_aggregates as (
      select
        rc.recipient_user_id,
        max(rc.recipient_email) as recipient_email,
        count(*)::integer as conversation_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'chat_id', rc.chat_id,
              'listing_id', rc.listing_id,
              'listing_title', rc.listing_title,
              'counterparty_user_id', rc.counterparty_user_id,
              'counterparty_name', rc.counterparty_name,
              'first_message_at', rc.first_message_at,
              'first_message_preview', rc.first_message_preview
            )
            order by rc.first_message_at desc
          ) filter (where rc.rn <= 3),
          '[]'::jsonb
        ) as conversations
      from ranked_conversations rc
      group by rc.recipient_user_id
    )
    select *
    from recipient_aggregates
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
        'conversation_count', v_prompt.conversation_count,
        'conversations', v_prompt.conversations
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

