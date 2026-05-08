do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'checkout_hold_status'
      and n.nspname = 'public'
  ) then
    create type public.checkout_hold_status as enum (
      'OPEN',
      'COMPLETED',
      'EXPIRED',
      'FAILED',
      'CANCELLED'
    );
  end if;
end
$$;

create table if not exists public.checkout_holds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  renter_id uuid not null references public."user"(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  guests integer not null default 1 check (guests > 0),
  expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  status public.checkout_hold_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checkout_holds_listing_time
  on public.checkout_holds (listing_id, start_at, end_at);

create index if not exists idx_checkout_holds_renter_id
  on public.checkout_holds (renter_id);

create index if not exists idx_checkout_holds_status_expires_at
  on public.checkout_holds (status, expires_at);

drop trigger if exists set_updated_at_checkout_holds on public.checkout_holds;
create trigger set_updated_at_checkout_holds
before update on public.checkout_holds
for each row execute function public.update_updated_at_column();

alter table public.checkout_holds enable row level security;

revoke all on public.checkout_holds from public, anon;
grant select on public.checkout_holds to authenticated;
grant select, insert, update, delete on public.checkout_holds to service_role;

drop policy if exists checkout_holds_select_own on public.checkout_holds;
create policy checkout_holds_select_own
on public.checkout_holds
for select
to authenticated
using (renter_id = auth.uid());

create or replace function public.quote_reservation_total(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
) returns double precision
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total double precision := 0;
  v_hour_ts timestamptz;
  v_weekday smallint;
  v_hour smallint;
  v_slot_price double precision;
begin
  if date_part('minute', p_start_at) <> 0 or date_part('second', p_start_at) <> 0
     or date_part('minute', p_end_at) <> 0 or date_part('second', p_end_at) <> 0 then
    raise exception 'Reservations must start/end on full hour boundaries';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'Invalid reservation range';
  end if;

  if not exists (
    select 1 from public.listings l where l.id = p_listing_id
  ) then
    raise exception 'Listing not found';
  end if;

  v_hour_ts := p_start_at;
  while v_hour_ts < p_end_at loop
    v_weekday := extract(dow from v_hour_ts)::smallint;
    v_hour := extract(hour from v_hour_ts)::smallint;

    select s.price into v_slot_price
    from public.listing_weekly_slots s
    where s.listing_id = p_listing_id
      and s.weekday = v_weekday
      and s.hour = v_hour;

    if v_slot_price is null then
      raise exception 'Hour % on weekday % is closed for this listing', v_hour, v_weekday;
    end if;

    v_total := v_total + v_slot_price;
    v_hour_ts := v_hour_ts + interval '1 hour';
  end loop;

  return v_total;
end;
$function$;

create or replace function public.create_checkout_hold(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer default 1,
  p_expires_at timestamptz default now() + interval '30 minutes'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_listing_owner_id uuid;
  v_listing_status public.listing_moderation_status;
  v_listing_record_status public.record_status;
  result public.checkout_holds%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    l.owner_id,
    l.moderation_status,
    l.status
  into v_listing_owner_id, v_listing_status, v_listing_record_status
  from public.listings l
  where l.id = p_listing_id;

  if v_listing_owner_id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing_record_status = 'DELETED'::public.record_status then
    raise exception 'Listing not found';
  end if;

  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;

  if v_listing_owner_id = v_uid then
    raise exception 'You cannot book your own listing';
  end if;

  perform public.quote_reservation_total(
    p_listing_id,
    p_start_at,
    p_end_at
  );

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = p_listing_id
      and r.status in ('PENDING', 'CONFIRMED')
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  if exists (
    select 1
    from public.checkout_holds h
    where h.listing_id = p_listing_id
      and h.status = 'OPEN'
      and h.expires_at > now()
      and h.renter_id <> v_uid
      and tstzrange(h.start_at, h.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'This time slot is currently being checked out by another guest. Please try again in a moment.';
  end if;

  insert into public.checkout_holds (
    listing_id,
    renter_id,
    start_at,
    end_at,
    guests,
    expires_at,
    status
  )
  values (
    p_listing_id,
    v_uid,
    p_start_at,
    p_end_at,
    p_guests,
    p_expires_at,
    'OPEN'
  )
  returning * into result;

  return to_jsonb(result);
end;
$function$;

create or replace function public.create_reservation_from_checkout_hold(
  p_hold_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hold public.checkout_holds%rowtype;
  v_listing_owner_id uuid;
  v_listing_status public.listing_moderation_status;
  v_listing_record_status public.record_status;
  v_listing_title text;
  v_confirm_by_at timestamptz;
  result public.reservations%rowtype;
begin
  select *
  into v_hold
  from public.checkout_holds h
  where h.id = p_hold_id;

  if v_hold.id is null then
    raise exception 'Checkout hold not found';
  end if;

  if v_hold.status <> 'OPEN'::public.checkout_hold_status then
    raise exception 'Checkout hold is no longer open';
  end if;

  if v_hold.expires_at <= now() then
    update public.checkout_holds
    set status = 'EXPIRED'::public.checkout_hold_status
    where id = v_hold.id
      and status = 'OPEN'::public.checkout_hold_status;

    raise exception 'Checkout hold expired';
  end if;

  select
    l.owner_id,
    l.moderation_status,
    l.status,
    l.title,
    public.calculate_advance_notice_start_at(
      coalesce(l.timezone, 'UTC'),
      l.advance_notice_hours,
      now()
    )
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_listing_title, v_confirm_by_at
  from public.listings l
  where l.id = v_hold.listing_id;

  if v_listing_owner_id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing_record_status = 'DELETED'::public.record_status then
    raise exception 'Listing not found';
  end if;

  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_hold.listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = v_hold.listing_id
      and r.status in ('PENDING', 'CONFIRMED')
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(v_hold.start_at, v_hold.end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  insert into public.reservations (
    listing_id,
    renter_id,
    start_at,
    end_at,
    guests,
    status,
    confirm_by_at
  )
  values (
    v_hold.listing_id,
    v_hold.renter_id,
    v_hold.start_at,
    v_hold.end_at,
    v_hold.guests,
    'PENDING',
    v_confirm_by_at
  )
  returning * into result;

  update public.checkout_holds
  set
    status = 'COMPLETED'::public.checkout_hold_status,
    reservation_id = result.id
  where id = v_hold.id;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_hold.renter_id then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      'New reservation request',
      format('%s has a new paid reservation request.', coalesce(v_listing_title, 'Your listing')),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_hold.listing_id)
    );
  end if;

  return to_jsonb(result);
end;
$function$;
