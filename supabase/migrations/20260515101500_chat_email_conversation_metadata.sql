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
    with eligible_recipients as (
      select
        p.recipient_user_id,
        u.email as recipient_email
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
    )
    select
      er.recipient_user_id,
      er.recipient_email,
      (
        select sum(p.message_count)::integer
        from public.chat_email_pending p
        where p.recipient_user_id = er.recipient_user_id
          and p.message_count > 0
          and p.email_sent = false
      ) as message_count,
      (
        select count(*)::integer
        from public.chat_email_pending p
        where p.recipient_user_id = er.recipient_user_id
          and p.message_count > 0
          and p.email_sent = false
      ) as conversation_count,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'chat_id', x.chat_id,
              'listing_id', x.listing_id,
              'listing_title', x.listing_title,
              'counterparty_user_id', x.counterparty_user_id,
              'counterparty_name', x.counterparty_name,
              'last_message_at', x.last_message_at,
              'message_count', x.message_count
            )
            order by x.last_message_at desc
          ),
          '[]'::jsonb
        )
        from (
          select
            p.chat_id,
            c.listing_id,
            l.title as listing_title,
            other_user.id as counterparty_user_id,
            coalesce(nullif(trim(concat_ws(' ', other_user.first_name, other_user.last_name)), ''), 'Someone') as counterparty_name,
            p.last_message_at,
            p.message_count
          from public.chat_email_pending p
          join public.chats c on c.id = p.chat_id
          left join public.listings l on l.id = c.listing_id
          join public.chat_participants cp_other
            on cp_other.chat_id = p.chat_id
           and cp_other.participant_id <> p.recipient_user_id
          join public."user" other_user on other_user.id = cp_other.participant_id
          where p.recipient_user_id = er.recipient_user_id
            and p.message_count > 0
            and p.email_sent = false
          order by p.last_message_at desc
          limit 3
        ) x
      ) as conversations
    from eligible_recipients er
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
        'message_count', v_prompt.message_count,
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
