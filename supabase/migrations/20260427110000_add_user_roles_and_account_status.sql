do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'account_status'
      and n.nspname = 'public'
  ) then
    create type public.account_status as enum (
      'ACTIVE',
      'SUSPENDED',
      'DELETED'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role'
      and n.nspname = 'public'
  ) then
    create type public.user_role as enum (
      'USER',
      'ADMIN',
      'MODERATOR',
      'SUPPORT'
    );
  end if;
end
$$;

alter table public."user"
  add column if not exists account_status public.account_status;

update public."user"
set account_status = coalesce(account_status, 'ACTIVE'::public.account_status);

alter table public."user"
  alter column account_status set default 'ACTIVE'::public.account_status,
  alter column account_status set not null;

create table if not exists public.user_roles (
  user_id uuid not null references public."user"(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists idx_user_roles_role on public.user_roles (role);

alter table public.user_roles enable row level security;

insert into public.user_roles (user_id, role)
select u.id, 'USER'::public.user_role
from public."user" u
on conflict (user_id, role) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'ADMIN'::public.user_role
from public."user" u
where coalesce(u.is_admin, false)
on conflict (user_id, role) do nothing;

create or replace function public.current_user_is_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_uid
      and ur.role = 'ADMIN'::public.user_role
  );
end;
$function$;

create or replace function public.get_actor_context_by_user_id(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'Forbidden';
  end if;

  select
    u.id,
    u.email,
    u.account_status,
    coalesce(
      (
        select jsonb_agg(ur.role order by ur.role)
        from public.user_roles ur
        where ur.user_id = u.id
      ),
      '[]'::jsonb
    ) as roles
  into v_profile
  from public."user" u
  where u.id = p_user_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'userId', v_profile.id,
    'email', v_profile.email,
    'accountStatus', v_profile.account_status,
    'roles', v_profile.roles
  );
end;
$function$;

alter table public."user"
  drop column if exists is_admin;

revoke all on public.user_roles from public, anon, authenticated;
grant select on public.user_roles to authenticated, service_role;

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

revoke select (account_status) on public."user" from anon, authenticated;
grant select (account_status) on public."user" to service_role;

grant execute on function public.current_user_is_admin() to authenticated, service_role;
revoke all on function public.get_actor_context_by_user_id(uuid) from public, anon;
grant execute on function public.get_actor_context_by_user_id(uuid) to authenticated, service_role;
