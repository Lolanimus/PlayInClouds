do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_status'
      and n.nspname = 'public'
  ) then
    create type public.payment_status as enum (
      'CHECKOUT_CREATED',
      'PAID',
      'FAILED',
      'REFUNDED',
      'PARTIALLY_REFUNDED'
    );
  end if;
end
$$;

create table if not exists public.reservation_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  renter_id uuid not null references public."user"(id) on delete cascade,
  host_user_id uuid not null references public."user"(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  amount_subtotal integer not null check (amount_subtotal >= 0),
  amount_platform_fee integer not null default 0 check (amount_platform_fee >= 0),
  amount_total integer not null check (amount_total >= 0),
  currency text not null default 'cad',
  status public.payment_status not null default 'CHECKOUT_CREATED',
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservation_payments_renter_id
  on public.reservation_payments (renter_id);

create index if not exists idx_reservation_payments_host_user_id
  on public.reservation_payments (host_user_id);

create index if not exists idx_reservation_payments_listing_id
  on public.reservation_payments (listing_id);

create index if not exists idx_reservation_payments_status
  on public.reservation_payments (status);

drop trigger if exists set_updated_at_reservation_payments on public.reservation_payments;
create trigger set_updated_at_reservation_payments
before update on public.reservation_payments
for each row execute function public.update_updated_at_column();

alter table public.reservation_payments enable row level security;

revoke all on public.reservation_payments from public, anon;
grant select on public.reservation_payments to authenticated;
grant select, insert, update, delete on public.reservation_payments to service_role;

drop policy if exists reservation_payments_select_participants on public.reservation_payments;
create policy reservation_payments_select_participants
on public.reservation_payments
for select
to authenticated
using (
  renter_id = auth.uid()
  or host_user_id = auth.uid()
);
