do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'host_transfer_status'
      and n.nspname = 'public'
  ) then
    create type public.host_transfer_status as enum (
      'NOT_READY',
      'READY',
      'TRANSFERRED',
      'FAILED',
      'REVERSED'
    );
  end if;
end
$$;

alter table if exists public.reservation_payments
  rename to reservation_guest_payments;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_webhook_events'
      and column_name = 'reservation_payment_id'
  ) then
    alter table public.stripe_webhook_events
      rename column reservation_payment_id to guest_payment_id;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'reservation_payments_reservation_id_key'
  ) then
    alter table public.reservation_guest_payments
      rename constraint reservation_payments_reservation_id_key to reservation_guest_payments_reservation_id_key;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'reservation_payments_reservation_id_fkey'
  ) then
    alter table public.reservation_guest_payments
      rename constraint reservation_payments_reservation_id_fkey to reservation_guest_payments_reservation_id_fkey;
  end if;
end
$$;

alter index if exists idx_reservation_payments_renter_id
  rename to idx_reservation_guest_payments_renter_id;

alter index if exists idx_reservation_payments_host_user_id
  rename to idx_reservation_guest_payments_host_user_id;

alter index if exists idx_reservation_payments_listing_id
  rename to idx_reservation_guest_payments_listing_id;

alter index if exists idx_reservation_payments_status
  rename to idx_reservation_guest_payments_status;

alter index if exists idx_reservation_payments_payout_status
  rename to idx_reservation_guest_payments_payout_status;

alter index if exists idx_reservation_payments_host_stripe_account_id
  rename to idx_reservation_guest_payments_host_stripe_account_id;

alter index if exists idx_reservation_payments_stripe_payout_id
  rename to idx_reservation_guest_payments_stripe_payout_id;

create table if not exists public.reservation_host_transfers (
  id uuid primary key default gen_random_uuid(),
  guest_payment_id uuid not null unique references public.reservation_guest_payments(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  host_user_id uuid not null references public."user"(id) on delete cascade,
  host_stripe_account_id text,
  amount integer not null check (amount >= 0),
  currency text not null default 'cad',
  transfer_group text,
  status public.host_transfer_status not null default 'NOT_READY',
  stripe_transfer_id text unique,
  failure_reason text,
  transferred_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservation_host_transfers_host_user_id
  on public.reservation_host_transfers (host_user_id);

create index if not exists idx_reservation_host_transfers_status
  on public.reservation_host_transfers (status);

create index if not exists idx_reservation_host_transfers_host_account_status
  on public.reservation_host_transfers (host_stripe_account_id, status);

drop trigger if exists set_updated_at_reservation_host_transfers on public.reservation_host_transfers;
create trigger set_updated_at_reservation_host_transfers
before update on public.reservation_host_transfers
for each row execute function public.update_updated_at_column();

alter table public.reservation_host_transfers enable row level security;

revoke all on public.reservation_host_transfers from public, anon;
grant select on public.reservation_host_transfers to authenticated;
grant select, insert, update, delete on public.reservation_host_transfers to service_role;

drop policy if exists reservation_host_transfers_select_host on public.reservation_host_transfers;
create policy reservation_host_transfers_select_host
on public.reservation_host_transfers
for select
to authenticated
using (host_user_id = auth.uid());

insert into public.reservation_host_transfers (
  guest_payment_id,
  reservation_id,
  host_user_id,
  host_stripe_account_id,
  amount,
  currency,
  transfer_group,
  status,
  stripe_transfer_id,
  failure_reason,
  transferred_at,
  created_at,
  updated_at
)
select
  guest_payment.id,
  guest_payment.reservation_id,
  guest_payment.host_user_id,
  host_account.stripe_account_id,
  greatest(guest_payment.amount_total - guest_payment.amount_platform_fee, 0),
  guest_payment.currency,
  'reservation:' || guest_payment.reservation_id::text,
  case
    when guest_payment.stripe_transfer_id is not null then 'TRANSFERRED'::public.host_transfer_status
    when guest_payment.status = 'PAID'::public.payment_status then 'NOT_READY'::public.host_transfer_status
    else 'NOT_READY'::public.host_transfer_status
  end,
  guest_payment.stripe_transfer_id,
  guest_payment.payout_failure_reason,
  guest_payment.paid_out_at,
  guest_payment.created_at,
  guest_payment.updated_at
from public.reservation_guest_payments guest_payment
left join public.host_payment_accounts host_account
  on host_account.user_id = guest_payment.host_user_id
where guest_payment.status = 'PAID'::public.payment_status
on conflict (guest_payment_id) do update
set
  host_stripe_account_id = excluded.host_stripe_account_id,
  amount = excluded.amount,
  currency = excluded.currency,
  transfer_group = excluded.transfer_group,
  updated_at = excluded.updated_at;

alter table if exists public.reservation_guest_payments
  drop column if exists host_stripe_account_id,
  drop column if exists stripe_transfer_id,
  drop column if exists stripe_payout_id,
  drop column if exists host_net_amount,
  drop column if exists payout_status,
  drop column if exists payout_failure_reason,
  drop column if exists paid_out_at;

create or replace function public.prevent_pending_reservation_payment_capture_fn()
returns trigger as $$
declare
  reservation_status public.reservation_status;
begin
  if new.status = 'PAID'::public.payment_status
     and coalesce(old.status, 'CHECKOUT_CREATED'::public.payment_status) <> 'PAID'::public.payment_status then
    select reservation.status
    into reservation_status
    from public.reservations reservation
    where reservation.id = new.reservation_id;

    if reservation_status is distinct from 'CONFIRMED'::public.reservation_status then
      raise exception 'Authorized payments can only be captured for confirmed reservations';
    end if;
  end if;

  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists prevent_pending_reservation_payment_capture on public.reservation_guest_payments;
create trigger prevent_pending_reservation_payment_capture
before update of status on public.reservation_guest_payments
for each row
execute function public.prevent_pending_reservation_payment_capture_fn();

create or replace function public.auto_cancel_pending_reservations_for_advance_notice()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cancelled_reservation record;
  cancelled_count integer := 0;
begin
  for cancelled_reservation in
    with updated as (
      update public.reservations reservation
      set status = 'CANCELLED'::public.reservation_status
      where reservation.status in (
        'PENDING'::public.reservation_status,
        'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status
      )
        and (
          reservation.payment_deadline <= now()
          or reservation.start_at <= now()
        )
        and not exists (
          select 1
          from public.reservation_guest_payments guest_payment
          where guest_payment.reservation_id = reservation.id
            and guest_payment.status = 'AUTH'::public.payment_status
        )
      returning reservation.id, reservation.renter_id, reservation.listing_id, reservation.start_at, reservation.payment_deadline
    )
    select updated.id, updated.renter_id, listing.owner_id, updated.listing_id, listing.title as listing_title, updated.start_at, updated.payment_deadline
    from updated
    join public.listings listing on listing.id = updated.listing_id
  loop
    cancelled_count := cancelled_count + 1;
    perform public.notify_auto_cancelled_pending_reservation(
      cancelled_reservation.id,
      cancelled_reservation.renter_id,
      cancelled_reservation.owner_id,
      cancelled_reservation.listing_id,
      cancelled_reservation.listing_title,
      'payment_deadline_passed'
    );
  end loop;

  return cancelled_count;
end;
$function$;

do $$
declare
  job_id bigint;
begin
  for job_id in
    select jobid
    from cron.job
    where jobname = 'reconcile-stripe-payouts'
  loop
    perform cron.unschedule(job_id);
  end loop;

  for job_id in
    select jobid
    from cron.job
    where jobname = 'release-pending-host-transfers'
  loop
    perform cron.unschedule(job_id);
  end loop;

  perform cron.schedule(
    'release-pending-host-transfers',
    '0 * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/release-pending-host-transfers',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;
