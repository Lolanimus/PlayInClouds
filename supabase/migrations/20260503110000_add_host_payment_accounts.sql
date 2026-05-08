create table if not exists public.host_payment_accounts (
  user_id uuid primary key references public."user"(id) on delete cascade,
  stripe_account_id text not null unique,
  onboarding_complete boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  country text,
  default_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_host_payment_accounts_stripe_account_id
  on public.host_payment_accounts (stripe_account_id);

drop trigger if exists set_updated_at_host_payment_accounts on public.host_payment_accounts;
create trigger set_updated_at_host_payment_accounts
before update on public.host_payment_accounts
for each row execute function public.update_updated_at_column();

alter table public.host_payment_accounts enable row level security;

revoke all on public.host_payment_accounts from public, anon;
grant select on public.host_payment_accounts to authenticated;
grant select, insert, update, delete on public.host_payment_accounts to service_role;

drop policy if exists host_payment_accounts_select_own on public.host_payment_accounts;
create policy host_payment_accounts_select_own
on public.host_payment_accounts
for select
to authenticated
using (user_id = auth.uid());
