do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'audit_action_type'
      and n.nspname = 'public'
  ) then
    create type public.audit_action_type as enum (
      'INSERT',
      'UPDATE',
      'DELETE'
    );
  end if;
end
$$;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_schema text not null,
  table_name text not null,
  action_type public.audit_action_type not null,
  row_pk jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public."user"(id) on delete set null,
  occurred_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists idx_audit_log_table_occurred_at
  on public.audit_log (table_schema, table_name, occurred_at desc);

create index if not exists idx_audit_log_actor_occurred_at
  on public.audit_log (actor_user_id, occurred_at desc);

create index if not exists idx_audit_log_row_pk_gin
  on public.audit_log using gin (row_pk);

alter table public.audit_log enable row level security;

revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to service_role;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new_data jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_source_data jsonb := coalesce(v_new_data, v_old_data, '{}'::jsonb);
  v_row_pk jsonb := '{}'::jsonb;
begin
  select coalesce(
    jsonb_object_agg(pk.attname, v_source_data -> pk.attname),
    '{}'::jsonb
  )
  into v_row_pk
  from (
    select a.attname
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = any(i.indkey)
    where i.indrelid = format('%I.%I', tg_table_schema, tg_table_name)::regclass
      and i.indisprimary
  ) pk;

  insert into public.audit_log (
    table_schema,
    table_name,
    action_type,
    row_pk,
    actor_user_id,
    occurred_at,
    old_data,
    new_data
  ) values (
    tg_table_schema,
    tg_table_name,
    tg_op::public.audit_action_type,
    v_row_pk,
    auth.uid(),
    now(),
    v_old_data,
    v_new_data
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

create or replace function public.enable_audit_trigger(
  p_schema_name text,
  p_table_name text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if to_regclass(format('%I.%I', p_schema_name, p_table_name)) is null then
    return;
  end if;

  execute format(
    'drop trigger if exists audit_row_change on %I.%I',
    p_schema_name,
    p_table_name
  );

  execute format(
    'create trigger audit_row_change after insert or update or delete on %I.%I for each row execute function public.audit_row_change()',
    p_schema_name,
    p_table_name
  );
end;
$function$;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in ARRAY ARRAY[
    'user',
    'user_roles',
    'listings',
    'listing_booking_policies',
    'reservations',
    'reservation_reviews',
    'chats',
    'chat_participants'
  ] loop
    perform public.enable_audit_trigger('public', v_table_name);
  end loop;
end
$$;