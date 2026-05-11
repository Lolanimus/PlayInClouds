create or replace function public.create_direct_chat(target_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  chat_row public.chats%rowtype;
  client_user_id uuid := auth.uid()::uuid;
begin
  if client_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or not public.current_user_can_view_user(target_user_id) then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  if p_listing_id is null then
    raise exception 'Listing id is required';
  end if;

  if not exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and l.status = 'ACTIVE'::public.record_status
      and public.current_user_can_view_user(l.owner_id)
      and (
        l.moderation_status = 'APPROVED'::public.listing_moderation_status
        or l.owner_id = client_user_id
        or public.current_user_can_moderate_listings()
      )
  ) then
    raise exception 'Listing not found';
  end if;

  with matching_direct_chats as (
    select
      c.id,
      c.status,
      count(*)::integer as participant_count,
      bool_and(public.current_user_can_view_user(cp.participant_id)) as participants_visible
    from public.chats c
    join public.chat_participants cp on cp.chat_id = c.id
    where c.chat_type = 'DIRECT'::public.chat_type
      and c.listing_id = p_listing_id
      and c.status in ('ACTIVE'::public.record_status, 'DELETED'::public.record_status)
    group by c.id, c.status
  )
  select c.*
  into chat_row
  from public.chats c
  join matching_direct_chats mdc on mdc.id = c.id
  join public.chat_participants cp1
    on cp1.chat_id = c.id and cp1.participant_id = client_user_id
  join public.chat_participants cp2
    on cp2.chat_id = c.id and cp2.participant_id = target_user_id
  where mdc.participant_count = 2
    and coalesce(mdc.participants_visible, false)
  order by
    case when c.status = 'ACTIVE'::public.record_status then 0 else 1 end,
    c.id
  limit 1;

  if found then
    if chat_row.status = 'DELETED'::public.record_status then
      update public.chats
      set status = 'ACTIVE'::public.record_status
      where id = chat_row.id
      returning * into chat_row;
    end if;

    return jsonb_build_object(
      'id', chat_row.id,
      'chat_type', chat_row.chat_type,
      'metadata', chat_row.metadata,
      'listing_id', chat_row.listing_id,
      'status', chat_row.status,
      'participants', (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name
          )
          order by cp.participant_id::text
        )
        from public.chat_participants cp
        join public."user" u on u.id = cp.participant_id
        where cp.chat_id = chat_row.id
      ),
      'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
      'updated_at', (
        select max(cm.created_at)
        from public.chat_messages cm
        where cm.chat_id = chat_row.id
          and cm.status = 'ACTIVE'::public.record_status
      )
    );
  end if;

  insert into public.chats (chat_type, metadata, listing_id, status)
  values ('DIRECT'::public.chat_type, '{}'::jsonb, p_listing_id, 'ACTIVE'::public.record_status)
  returning * into chat_row;

  insert into public.chat_participants (chat_id, participant_id, metadata)
  select chat_row.id, participant_id, '{}'::jsonb
  from (
    select distinct unnest(array[client_user_id, target_user_id]) as participant_id
  ) participants;

  return jsonb_build_object(
    'id', chat_row.id,
    'chat_type', chat_row.chat_type,
    'metadata', chat_row.metadata,
    'listing_id', chat_row.listing_id,
    'status', chat_row.status,
    'participants', (
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name
        )
        order by cp.participant_id::text
      )
      from public.chat_participants cp
      join public."user" u on u.id = cp.participant_id
      where cp.chat_id = chat_row.id
    ),
    'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
    'updated_at', null
  );
end;
$function$;
