create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public."user"
  add column if not exists preferred_currency text;

update public."user"
set preferred_currency = coalesce(preferred_currency, 'CAD');

alter table public."user"
  drop constraint if exists user_preferred_currency_check;

alter table public."user"
  add constraint user_preferred_currency_check
  check (preferred_currency in ('CAD', 'USD', 'EUR'));

alter table public."user"
  alter column preferred_currency set default 'CAD',
  alter column preferred_currency set not null;

create table if not exists public.exchange_rates (
  base_currency text not null,
  quote_currency text not null,
  rate numeric not null check (rate > 0),
  as_of date not null,
  source text not null default 'bank_of_canada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (base_currency, quote_currency, as_of),
  constraint exchange_rates_base_currency_check check (base_currency in ('CAD')),
  constraint exchange_rates_quote_currency_check check (quote_currency in ('CAD', 'USD', 'EUR'))
);

create index if not exists idx_exchange_rates_latest
  on public.exchange_rates (base_currency, quote_currency, as_of desc);

create or replace function public.get_current_user_currency_preference()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_preferred_currency text := 'CAD';
begin
  if v_uid is not null then
    select u.preferred_currency
    into v_preferred_currency
    from public."user" u
    where u.id = v_uid;
  end if;

  return jsonb_build_object(
    'preferred_currency', coalesce(v_preferred_currency, 'CAD')
  );
end;
$function$;

create or replace function public.update_current_user_currency_preference(
  p_preferred_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_preferred_currency text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_preferred_currency not in ('CAD', 'USD', 'EUR') then
    raise exception 'Unsupported currency';
  end if;

  update public."user" u
  set
    preferred_currency = p_preferred_currency,
    updated_at = now()
  where u.id = v_uid
  returning u.preferred_currency into v_preferred_currency;

  if v_preferred_currency is null then
    raise exception 'User not found';
  end if;

  return jsonb_build_object(
    'preferred_currency', v_preferred_currency
  );
end;
$function$;

create or replace function public.get_latest_exchange_rates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_as_of date;
  v_cad_to_usd numeric;
  v_cad_to_eur numeric;
begin
  select max(er.as_of)
  into v_as_of
  from public.exchange_rates er
  where er.base_currency = 'CAD'
    and er.quote_currency in ('USD', 'EUR');

  if v_as_of is not null then
    select er.rate
    into v_cad_to_usd
    from public.exchange_rates er
    where er.base_currency = 'CAD'
      and er.quote_currency = 'USD'
      and er.as_of = v_as_of;

    select er.rate
    into v_cad_to_eur
    from public.exchange_rates er
    where er.base_currency = 'CAD'
      and er.quote_currency = 'EUR'
      and er.as_of = v_as_of;
  end if;

  return jsonb_build_object(
    'base_currency', 'CAD',
    'as_of', v_as_of,
    'cad_to_cad', 1,
    'cad_to_usd', v_cad_to_usd,
    'cad_to_eur', v_cad_to_eur
  );
end;
$function$;

grant execute on function public.get_current_user_currency_preference() to anon, authenticated, service_role;
grant execute on function public.update_current_user_currency_preference(text) to authenticated, service_role;
grant execute on function public.get_latest_exchange_rates() to anon, authenticated, service_role;

do $do$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'sync-exchange-rates'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'sync-exchange-rates',
    '0 22 * * 1-5',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/sync-exchange-rates',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$do$;
