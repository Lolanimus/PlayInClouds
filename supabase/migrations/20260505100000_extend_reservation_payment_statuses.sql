do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_status'
      and n.nspname = 'public'
  ) then
    alter type public.payment_status add value if not exists 'AUTH';
    alter type public.payment_status add value if not exists 'AUTH_CANCELED';
  end if;
end
$$;

alter table public.reservation_payments
  add column if not exists authorized_at timestamptz,
  add column if not exists authorization_expires_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists canceled_at timestamptz;
