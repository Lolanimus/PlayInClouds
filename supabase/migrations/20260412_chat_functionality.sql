-- Chat system: enums, tables, triggers, functions, RLS (no user_contacts)
-- Adjust schema name / table name "user" if your project differs.

set check_function_bodies = off;

-- Enum: only value needed for chat realtime in this migration
do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_type' and typnamespace = (select oid from pg_namespace where nspname = 'public')) then
    create type public.chat_type as enum ('DIRECT', 'GROUP', 'SELF');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'realtime_events' and typnamespace = (select oid from pg_namespace where nspname = 'public')) then
    create type public.realtime_events as enum ('chats_update');
  end if;
end$$;

-- Tables
create table if not exists public.chats (
  id uuid not null default gen_random_uuid(),
  chat_type public.chat_type not null,
  metadata jsonb
);

create table if not exists public.chat_participants (
  chat_id uuid not null,
  participant_id uuid not null,
  metadata jsonb not null
);

create table if not exists public.chat_messages (
  id uuid not null default gen_random_uuid(),
  sender_id uuid not null,
  chat_id uuid not null,
  contents text not null,
  created_at timestamptz not null default now(),
  metadata jsonb
);

-- Primary keys & indexes
alter table only public.chats add constraint chats_pkey primary key (id);

alter table only public.chat_participants
  add constraint chat_participants_pkey primary key (chat_id, participant_id);

create unique index if not exists chat_messages_pkey on public.chat_messages using btree (id);
alter table only public.chat_messages add constraint chat_messages_pkey primary key using index chat_messages_pkey;

create index if not exists idx_chat_participants_chat_count on public.chat_participants using btree (chat_id, participant_id);
create index if not exists idx_chat_participants_metadata on public.chat_participants using btree (metadata);
create index if not exists idx_chat_participants_participant_chat on public.chat_participants using btree (participant_id, chat_id);
create index if not exists idx_chat_participants_participant_id on public.chat_participants using btree (participant_id);

create index if not exists idx_chat_messages_chat_id_timestamp on public.chat_messages using btree (chat_id, created_at desc);
create index if not exists idx_chat_messages_sender_id on public.chat_messages using btree (sender_id);

-- FKs (requires public.user)
alter table only public.chat_participants
  add constraint chat_participants_chat_id_fkey foreign key (chat_id) references public.chats (id) on delete cascade;

alter table only public.chat_participants
  add constraint chat_participants_participant_id_fkey foreign key (participant_id) references public."user" (id) on delete cascade;

alter table only public.chat_messages
  add constraint chat_messages_chat_id_fkey foreign key (chat_id) references public.chats (id) on delete cascade;

alter table only public.chat_messages
  add constraint chat_messages_sender_id_fkey foreign key (sender_id) references public."user" (id);

-- Participant limit trigger
create or replace function public.check_chat_participant_limit()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if (select count(*) from public.chat_participants where chat_id = new.chat_id) > 100 then
    raise exception 'Chat cannot have more than 100 participants';
  end if;
  return new;
end;
$function$;

drop trigger if exists trigger_participant_limit on public.chat_participants;
create trigger trigger_participant_limit
  before insert on public.chat_participants
  for each row execute function public.check_chat_participant_limit();

-- Chat RPCs (no friendship checks — any user may open a direct chat with any other user id)
create or replace function public.create_direct_chat(target_user_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  chat_row public.chats%rowtype;
  client_user_id uuid := auth.uid()::uuid;
begin
  if target_user_id is null then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  select c.*
  into chat_row
  from public.chats c
  join public.chat_participants cp1
    on cp1.chat_id = c.id and cp1.participant_id = client_user_id
  join public.chat_participants cp2
    on cp2.chat_id = c.id and cp2.participant_id = target_user_id
  where c.chat_type = 'DIRECT'::public.chat_type
  order by c.id
  limit 1;

  if found then
    return jsonb_build_object(
      'id', chat_row.id,
      'chat_type', chat_row.chat_type,
      'metadata', chat_row.metadata
    );
  end if;

  insert into public.chats (chat_type, metadata)
  values ('DIRECT'::public.chat_type, '{}'::jsonb)
  returning * into chat_row;

  insert into public.chat_participants (chat_id, participant_id, metadata)
  select chat_row.id, participant_id, '{}'::jsonb
  from (
    select distinct unnest(array[client_user_id, target_user_id]) as participant_id
  ) participants;

  return jsonb_build_object(
    'id', chat_row.id,
    'chat_type', chat_row.chat_type,
    'metadata', chat_row.metadata
  );
end;
$function$;

create or replace function public.get_client_chats()
returns jsonb
language plpgsql
set search_path to ''
as $function$
begin
  return (
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'metadata', c.metadata
      )
    )
    from public.chats c
    join public.chat_participants cp on c.id = cp.chat_id
    where cp.participant_id = auth.uid()
  );
end;
$function$;

create or replace function public.get_direct_chat_by_user_id(target_user_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  client_user_id uuid := auth.uid()::uuid;
begin
  if target_user_id is null then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  return (
    select jsonb_build_object(
      'id', c.id,
      'chat_type', c.chat_type,
      'metadata', c.metadata
    )
    from public.chats c
    join public.chat_participants cp1
      on cp1.chat_id = c.id and cp1.participant_id = client_user_id
    join public.chat_participants cp2
      on cp2.chat_id = c.id and cp2.participant_id = target_user_id
    where c.chat_type = 'DIRECT'::public.chat_type
    order by c.id
    limit 1
  );
end;
$function$;

-- Message broadcast + RPCs
create or replace function public.chat_messages_changes()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  participant_record record;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    for participant_record in
      select participant_id
      from public.chat_participants
      where chat_id = new.chat_id
    loop
      perform realtime.send(
        to_jsonb(new),
        ('chats_update'::public.realtime_events)::text,
        'chats:' || participant_record.participant_id,
        true
      );
    end loop;
  elsif tg_op = 'DELETE' then
    for participant_record in
      select participant_id
      from public.chat_participants
      where chat_id = old.chat_id
    loop
      perform realtime.send(
        to_jsonb(old),
        ('chats_update'::public.realtime_events)::text,
        'chats:' || participant_record.participant_id,
        true
      );
    end loop;
  end if;
  return null;
end;
$function$;

create or replace function public.create_message(p_chat_id uuid, p_contents text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if p_contents is null or p_contents = '' then
    raise exception 'Can''t create an empty message';
  end if;

  insert into public.chat_messages (sender_id, chat_id, contents)
  values (auth.uid(), p_chat_id, p_contents)
  returning jsonb_build_object(
    'id', id,
    'sender_id', sender_id,
    'chat_id', chat_id,
    'contents', contents,
    'created_at', created_at
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.delete_messages(msg_ids uuid[])
returns boolean
language plpgsql
set search_path to ''
as $function$
begin
  delete from public.chat_messages where id = any (msg_ids);
  return true;
end;
$function$;

create or replace function public.get_messages(p_chat_id uuid, p_cursor integer default 0, p_limit integer default 20)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_messages jsonb;
  v_total_count int;
  v_next_cursor int;
begin
  select count(*) into v_total_count
  from public.chat_messages cm
  where cm.chat_id = p_chat_id;

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
          'created_at', m.created_at
        ) order by m.created_at desc
      ),
      '[]'::jsonb
    ),
    'nextCursor', v_next_cursor
  ) into v_messages
  from (
    select cm.id, cm.sender_id, cm.chat_id, cm.contents, cm.created_at
    from public.chat_messages cm
    where cm.chat_id = p_chat_id
    order by cm.created_at desc
    offset p_cursor
    limit p_limit
  ) m;

  return v_messages;
end;
$function$;

drop trigger if exists broadcast_changes_for_chat_messages_trigger on public.chat_messages;
create trigger broadcast_changes_for_chat_messages_trigger
  after insert or delete or update on public.chat_messages
  for each row execute function public.chat_messages_changes();

-- RLS
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_insert on public.chats;
create policy chat_insert on public.chats for all to authenticated using (true);

drop policy if exists chat_select on public.chats;
create policy chat_select on public.chats for all to authenticated using (
  id in (select cp.chat_id from public.chat_participants cp where cp.participant_id = auth.uid())
);

drop policy if exists chat_participants_insert on public.chat_participants;
create policy chat_participants_insert on public.chat_participants for all to authenticated using (true);

drop policy if exists chat_participants_select on public.chat_participants;
create policy chat_participants_select on public.chat_participants for all to authenticated using (participant_id = auth.uid());

drop policy if exists insert_message on public.chat_messages;
create policy insert_message on public.chat_messages for insert to authenticated with check (
  chat_id in (select cp.chat_id from public.chat_participants cp where cp.participant_id = auth.uid())
  and sender_id = auth.uid()
);

drop policy if exists get_messages on public.chat_messages;
create policy get_messages on public.chat_messages for select to authenticated using (
  chat_id in (select cp.chat_id from public.chat_participants cp where cp.participant_id = auth.uid())
);

drop policy if exists delete_message on public.chat_messages;
create policy delete_message on public.chat_messages for delete to authenticated using (
  chat_id in (select cp.chat_id from public.chat_participants cp where cp.participant_id = auth.uid())
);

-- Grants (tightened vs original: no broad anon on chat_messages — add if your client needs it)
grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on public.chats to authenticated, service_role;
grant select, insert, update, delete on public.chat_participants to authenticated, service_role;
grant select, insert, update, delete on public.chat_messages to authenticated, service_role;

grant execute on function public.create_direct_chat(uuid) to authenticated, service_role;
grant execute on function public.get_client_chats() to authenticated, service_role;
grant execute on function public.get_direct_chat_by_user_id(uuid) to authenticated, service_role;
grant execute on function public.create_message(uuid, text) to authenticated, service_role;
grant execute on function public.get_messages(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.delete_messages(uuid[]) to authenticated, service_role;