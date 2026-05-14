create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.email_dispatch_keys (
  dedupe_key text primary key,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_notify_reservation_status_transition_email on public.reservations;
drop trigger if exists trg_enqueue_reservation_created_email_jobs on public.reservations;
drop trigger if exists trg_enqueue_reservation_status_transition_email_jobs on public.reservations;
drop trigger if exists trg_enqueue_reservation_created on public.reservations;
drop trigger if exists trg_enqueue_reservation_status_transition on public.reservations;
drop function if exists public.notify_reservation_status_transition_email();
drop function if exists public.reservation_notification_email();
drop function if exists public.enqueue_reservation_email_jobs();
drop function if exists public.enqueue_email_queue_message(text, text, uuid, text, jsonb, text);

create or replace function public.enqueue_email(
  p_job_type text,
  p_recipient_role text,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_payload jsonb,
  p_dedupe_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
begin
  insert into public.email_dispatch_keys (
    dedupe_key
  )
  values (
    p_dedupe_key
  )
  on conflict (dedupe_key) do nothing;

  if not found then
    return;
  end if;

  perform pgmq_public.send(
    'emails_queue',
    jsonb_build_object(
      'dedupe_key', p_dedupe_key,
      'job_type', p_job_type,
      'recipient_role', p_recipient_role,
      'recipient_user_id', p_recipient_user_id,
      'recipient_email', p_recipient_email,
      'payload', p_payload
    ),
    0
  );
end;
$function$;

create or replace function public.enqueue_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing_title text;
  v_listing_timezone text;
  v_host_id uuid;
  v_host_email text;
  v_host_first_name text;
  v_host_last_name text;
  v_host_stripe_account_id text;
  v_host_payouts_enabled boolean;
  v_renter_email text;
  v_renter_first_name text;
  v_renter_last_name text;
  v_transition text;
  v_payload jsonb;
begin
  select
    l.title,
    coalesce(l.timezone, 'UTC'),
    l.owner_id,
    host.email,
    host.first_name,
    host.last_name,
    hpa.stripe_account_id,
    hpa.payouts_enabled,
    renter.email,
    renter.first_name,
    renter.last_name
  into
    v_listing_title,
    v_listing_timezone,
    v_host_id,
    v_host_email,
    v_host_first_name,
    v_host_last_name,
    v_host_stripe_account_id,
    v_host_payouts_enabled,
    v_renter_email,
    v_renter_first_name,
    v_renter_last_name
  from public.listings l
  join public."user" host on host.id = l.owner_id
  left join public.host_payment_accounts hpa on hpa.user_id = l.owner_id
  join public."user" renter on renter.id = new.renter_id
  where l.id = new.listing_id;

  if tg_op = 'INSERT' then
    if new.status <> 'PENDING'::public.reservation_status then
      return new;
    end if;

    v_payload := jsonb_build_object(
      'reservation_id', new.id,
      'listing_title', v_listing_title,
      'listing_time_zone', v_listing_timezone,
      'start_at', new.start_at,
      'end_at', new.end_at,
      'guests', new.guests,
      'total_price', new.total_price,
      'payment_deadline', new.payment_deadline,
      'renter_first_name', v_renter_first_name,
      'renter_last_name', v_renter_last_name,
      'host_first_name', v_host_first_name,
      'host_last_name', v_host_last_name
    );

    if v_renter_email is not null then
      perform public.enqueue_email(
        'reservation_created',
        'booker',
        new.renter_id,
        v_renter_email,
        v_payload,
        'reservation-created-' || new.id::text || '-booker'
      );
    end if;

    if v_host_email is not null and v_host_id <> new.renter_id then
      perform public.enqueue_email(
        'reservation_created',
        'host',
        v_host_id,
        v_host_email,
        v_payload,
        'reservation-created-' || new.id::text || '-host'
      );

      if v_host_stripe_account_id is null or coalesce(v_host_payouts_enabled, false) = false then
        perform public.enqueue_email(
          'host_payout_setup_needed',
          'host',
          v_host_id,
          v_host_email,
          jsonb_build_object(
            'reservation_id', new.id,
            'listing_id', new.listing_id,
            'listing_title', v_listing_title,
            'host_first_name', v_host_first_name,
            'host_last_name', v_host_last_name
          ),
          'host-payout-setup-needed-' || new.id::text || '-host'
        );
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_transition := old.status::text || '-' || new.status::text;

    if v_transition not in (
      'PENDING-CONFIRMED',
      'PENDING-CANCELLED',
      'CONFIRMED-CANCELLED'
    ) then
      return new;
    end if;

    v_payload := jsonb_build_object(
      'reservation_id', new.id,
      'listing_title', v_listing_title,
      'listing_time_zone', v_listing_timezone,
      'start_at', new.start_at,
      'end_at', new.end_at,
      'guests', new.guests,
      'total_price', new.total_price,
      'renter_first_name', v_renter_first_name,
      'renter_last_name', v_renter_last_name,
      'host_first_name', v_host_first_name,
      'host_last_name', v_host_last_name,
      'status_transition', v_transition
    );

    if v_renter_email is not null then
      perform public.enqueue_email(
        'reservation_status_changed',
        'booker',
        new.renter_id,
        v_renter_email,
        v_payload,
        'reservation-status-' || new.id::text || '-' || v_transition || '-booker'
      );
    end if;

    return new;
  end if;

  return new;
end;
$function$;

create trigger trg_enqueue_reservation_created
after insert on public.reservations
for each row
execute function public.enqueue_reservation();

create trigger trg_enqueue_reservation_status_transition
after update on public.reservations
for each row
when (old.status is distinct from new.status)
execute function public.enqueue_reservation();

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'process-emails-queue'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'process-emails-queue',
    '* * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/process-emails-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'limit', 25
        )
      );
    $job$
  );
end;
$$;
