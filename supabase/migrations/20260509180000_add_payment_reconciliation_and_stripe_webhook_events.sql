do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payout_status'
      and n.nspname = 'public'
  ) then
    create type public.payout_status as enum (
      'NOT_STARTED',
      'PENDING',
      'PAID',
      'FAILED'
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
    where t.typname = 'stripe_webhook_event_status'
      and n.nspname = 'public'
  ) then
    create type public.stripe_webhook_event_status as enum (
      'RECEIVED',
      'PROCESSED',
      'FAILED',
      'IGNORED'
    );
  end if;
end
$$;

alter table public.reservation_payments
  add column if not exists host_stripe_account_id text,
  add column if not exists stripe_balance_transaction_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_payout_id text,
  add column if not exists host_net_amount integer,
  add column if not exists payout_status public.payout_status not null default 'NOT_STARTED',
  add column if not exists payout_failure_reason text,
  add column if not exists paid_out_at timestamptz,
  add column if not exists last_reconciled_at timestamptz;

update public.reservation_payments rp
set
  host_stripe_account_id = coalesce(rp.host_stripe_account_id, hpa.stripe_account_id),
  host_net_amount = coalesce(rp.host_net_amount, greatest(rp.amount_total - rp.amount_platform_fee, 0)),
  payout_status = case
    when rp.payout_status is not distinct from 'NOT_STARTED'::public.payout_status
      and rp.status = 'PAID'::public.payment_status
      and hpa.stripe_account_id is not null
    then 'PENDING'::public.payout_status
    else rp.payout_status
  end
from public.host_payment_accounts hpa
where hpa.user_id = rp.host_user_id;

update public.reservation_payments
set host_net_amount = greatest(amount_total - amount_platform_fee, 0)
where host_net_amount is null;

alter table public.reservation_payments
  alter column host_net_amount set not null;

create index if not exists idx_reservation_payments_payout_status
  on public.reservation_payments (payout_status);

create index if not exists idx_reservation_payments_host_stripe_account_id
  on public.reservation_payments (host_stripe_account_id);

create index if not exists idx_reservation_payments_stripe_payout_id
  on public.reservation_payments (stripe_payout_id);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  stripe_account_id text,
  event_type text not null,
  stripe_object_id text,
  reservation_id uuid references public.reservations(id) on delete set null,
  reservation_payment_id uuid references public.reservation_payments(id) on delete set null,
  payload jsonb not null,
  status public.stripe_webhook_event_status not null default 'RECEIVED',
  error_message text,
  event_created_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_status
  on public.stripe_webhook_events (status);

create index if not exists idx_stripe_webhook_events_event_type
  on public.stripe_webhook_events (event_type);

create index if not exists idx_stripe_webhook_events_reservation_id
  on public.stripe_webhook_events (reservation_id);

create index if not exists idx_stripe_webhook_events_reservation_payment_id
  on public.stripe_webhook_events (reservation_payment_id);

drop trigger if exists set_updated_at_stripe_webhook_events on public.stripe_webhook_events;
create trigger set_updated_at_stripe_webhook_events
before update on public.stripe_webhook_events
for each row execute function public.update_updated_at_column();

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
