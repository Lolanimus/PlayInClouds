alter table public.chats
  add column if not exists listing_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chats_listing_id_fkey'
  ) then
    alter table only public.chats
      add constraint chats_listing_id_fkey
      foreign key (listing_id) references public.listings (id) on delete cascade;
  end if;
end$$;

create index if not exists idx_chats_listing_id on public.chats using btree (listing_id);
create index if not exists idx_chats_listing_type on public.chats using btree (listing_id, chat_type);

create or replace function public.create_direct_chat(target_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  chat_row public.chats%rowtype;
  client_user_id uuid := auth.uid()::uuid;
begin
  if target_user_id is null then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  if p_listing_id is null then
    raise exception 'Listing id is required';
  end if;

  select c.*
  into chat_row
  from public.chats c
  join public.chat_participants cp1
    on cp1.chat_id = c.id and cp1.participant_id = client_user_id
  join public.chat_participants cp2
    on cp2.chat_id = c.id and cp2.participant_id = target_user_id
  where c.chat_type = 'DIRECT'::public.chat_type
    and c.listing_id = p_listing_id
    and (
      select count(*)
      from public.chat_participants cp
      where cp.chat_id = c.id
    ) = 2
  order by c.id
  limit 1;

  if found then
    return jsonb_build_object(
      'id', chat_row.id,
      'chat_type', chat_row.chat_type,
      'metadata', chat_row.metadata,
      'listing_id', chat_row.listing_id,
      'participants', (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name
          )
          order by cp.participant_id::text
        )
        from public.chat_participants cp
        join public."user" u on u.id = cp.participant_id
        where cp.chat_id = chat_row.id
      ),
      'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
      'updated_at', (
        select max(cm.created_at)
        from public.chat_messages cm
        where cm.chat_id = chat_row.id
      )
    );
  end if;

  insert into public.chats (chat_type, metadata, listing_id)
  values ('DIRECT'::public.chat_type, '{}'::jsonb, p_listing_id)
  returning * into chat_row;

  insert into public.chat_participants (chat_id, participant_id, metadata)
  select chat_row.id, participant_id, '{}'::jsonb
  from (
    select distinct unnest(array[client_user_id, target_user_id]) as participant_id
  ) participants;

  return jsonb_build_object(
    'id', chat_row.id,
    'chat_type', chat_row.chat_type,
    'metadata', chat_row.metadata,
    'listing_id', chat_row.listing_id,
    'participants', (
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name
        )
        order by cp.participant_id::text
      )
      from public.chat_participants cp
      join public."user" u on u.id = cp.participant_id
      where cp.chat_id = chat_row.id
    ),
    'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
    'updated_at', null
  );
end;
$function$;

create or replace function public.get_client_chats()
returns jsonb
language plpgsql
set search_path to ''
as $function$
begin
  return (
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'chat_type', c.chat_type,
        'metadata', c.metadata,
        'listing_id', c.listing_id,
        'participants', (
          select jsonb_agg(
            jsonb_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name
            )
            order by cp2.participant_id::text
          )
          from public.chat_participants cp2
          join public."user" u on u.id = cp2.participant_id
          where cp2.chat_id = c.id
        ),
        'participant_ids', (
          select jsonb_agg(cp2.participant_id::text order by cp2.participant_id::text)
          from public.chat_participants cp2
          where cp2.chat_id = c.id
        ),
        'updated_at', (
          select max(cm.created_at)
          from public.chat_messages cm
          where cm.chat_id = c.id
        )
      )
      order by (
        select max(cm.created_at)
        from public.chat_messages cm
        where cm.chat_id = c.id
      ) desc nulls last,
      c.id desc
    )
    from public.chats c
    join public.chat_participants cp on c.id = cp.chat_id
    where cp.participant_id = auth.uid()
  );
end;
$function$;

create or replace function public.get_direct_chat_by_user_id(target_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  client_user_id uuid := auth.uid()::uuid;
begin
  if target_user_id is null then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  if p_listing_id is null then
    raise exception 'Listing id is required';
  end if;

  return (
    select jsonb_build_object(
      'id', c.id,
      'chat_type', c.chat_type,
      'metadata', c.metadata,
      'listing_id', c.listing_id,
      'participants', (
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name
          )
          order by cp.participant_id::text
        )
        from public.chat_participants cp
        join public."user" u on u.id = cp.participant_id
        where cp.chat_id = c.id
      ),
      'participant_ids', jsonb_build_array(client_user_id::text, target_user_id::text),
      'updated_at', (
        select max(cm.created_at)
        from public.chat_messages cm
        where cm.chat_id = c.id
      )
    )
    from public.chats c
    join public.chat_participants cp1
      on cp1.chat_id = c.id and cp1.participant_id = client_user_id
    join public.chat_participants cp2
      on cp2.chat_id = c.id and cp2.participant_id = target_user_id
    where c.chat_type = 'DIRECT'::public.chat_type
      and c.listing_id = p_listing_id
      and (
        select count(*)
        from public.chat_participants cp
        where cp.chat_id = c.id
      ) = 2
    order by c.id
    limit 1
  );
end;
$function$;

alter table public.listings
  add column if not exists host_confirmation_message text;

update public.listings
set host_confirmation_message = coalesce(host_confirmation_message, '')
where host_confirmation_message is null;

alter table public.listings
  alter column host_confirmation_message set default '',
  alter column host_confirmation_message set not null;

drop function if exists public.create_listing(
  double precision,
  double precision,
  text,
  text,
  text,
  public.listing_category,
  double precision,
  text[],
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  text
);

create or replace function public.create_listing(
  p_lat double precision,
  p_lng double precision,
  p_address text,
  p_title text,
  p_subtitle text,
  p_category public.listing_category,
  p_price double precision,
  p_images text[],
  p_description text,
  p_equipment_desc text,
  p_conveniences_desc text,
  p_area_m2 double precision,
  p_cancellation_policy_hours integer default null,
  p_advance_notice_hours integer default null,
  p_timezone text default 'UTC',
  p_host_confirmation_message text default ''
) returns jsonb as $$
declare
  result public.listings%rowtype;
  v_timezone text;
begin
  if p_area_m2 <= 0 then
    raise exception 'Area must be greater than 0 m2';
  end if;

  if p_cancellation_policy_hours is not null and p_cancellation_policy_hours < 0 then
    raise exception 'Cancellation policy hours must be >= 0';
  end if;

  if p_advance_notice_hours is not null and p_advance_notice_hours < 0 then
    raise exception 'Advance notice hours must be >= 0';
  end if;

  v_timezone := public.assert_valid_timezone(p_timezone);

  insert into public.listings(
    lat,
    lng,
    address,
    title,
    subtitle,
    category,
    price,
    images,
    description,
    equipment_desc,
    conveniences_desc,
    area_m2,
    cancellation_policy_hours,
    advance_notice_hours,
    owner_id,
    timezone,
    host_confirmation_message
  ) values (
    p_lat,
    p_lng,
    p_address,
    p_title,
    p_subtitle,
    p_category,
    p_price,
    p_images,
    p_description,
    p_equipment_desc,
    p_conveniences_desc,
    p_area_m2,
    p_cancellation_policy_hours,
    p_advance_notice_hours,
    auth.uid(),
    v_timezone,
    coalesce(p_host_confirmation_message, '')
  ) returning * into result;

  return to_jsonb(result);
end;
$$ language plpgsql set search_path = '';

drop function if exists public.update_listing(
  uuid,
  double precision,
  double precision,
  text,
  text,
  text,
  public.listing_category,
  double precision,
  text[],
  text,
  text,
  text,
  double precision,
  integer,
  integer,
  text
);

create or replace function public.update_listing(
  p_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_address text default null,
  p_title text default null,
  p_subtitle text default null,
  p_category public.listing_category default null,
  p_price double precision default null,
  p_images text[] default null,
  p_description text default null,
  p_equipment_desc text default null,
  p_conveniences_desc text default null,
  p_area_m2 double precision default null,
  p_cancellation_policy_hours integer default null,
  p_advance_notice_hours integer default null,
  p_timezone text default null,
  p_host_confirmation_message text default null
) returns jsonb as $$
declare
  result public.listings%rowtype;
  v_timezone text;
begin
  if p_area_m2 is not null and p_area_m2 <= 0 then
    raise exception 'Area must be greater than 0 m2';
  end if;

  if p_cancellation_policy_hours is not null and p_cancellation_policy_hours < 0 then
    raise exception 'Cancellation policy hours must be >= 0';
  end if;

  if p_advance_notice_hours is not null and p_advance_notice_hours < 0 then
    raise exception 'Advance notice hours must be >= 0';
  end if;

  v_timezone := case
    when p_timezone is null then null
    else public.assert_valid_timezone(p_timezone)
  end;

  update public.listings
  set
    lat = coalesce(p_lat, lat),
    lng = coalesce(p_lng, lng),
    address = coalesce(p_address, address),
    title = coalesce(p_title, title),
    subtitle = coalesce(p_subtitle, subtitle),
    category = coalesce(p_category, category),
    price = coalesce(p_price, price),
    images = coalesce(p_images, images),
    description = coalesce(p_description, description),
    equipment_desc = coalesce(p_equipment_desc, equipment_desc),
    conveniences_desc = coalesce(p_conveniences_desc, conveniences_desc),
    area_m2 = coalesce(p_area_m2, area_m2),
    cancellation_policy_hours = p_cancellation_policy_hours,
    advance_notice_hours = p_advance_notice_hours,
    timezone = coalesce(v_timezone, timezone),
    host_confirmation_message = coalesce(p_host_confirmation_message, host_confirmation_message)
  where id = p_id
  returning * into result;

  return to_jsonb(result);
end;
$$ language plpgsql set search_path = '';

create or replace function public.confirm_reservation(
  p_reservation_id uuid
) returns jsonb as $$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_end_at timestamptz;
  v_renter_id uuid;
  v_listing_id uuid;
  v_host_confirmation_message text;
  v_chat jsonb;
  v_chat_id uuid;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select l.owner_id, r.end_at, r.renter_id, r.listing_id, l.host_confirmation_message
  into v_owner_id, v_end_at, v_renter_id, v_listing_id, v_host_confirmation_message
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_owner_id <> v_uid then
    raise exception 'Only listing owner can confirm this reservation';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be confirmed';
  end if;

  update public.reservations r
  set status = 'CONFIRMED'
  where r.id = p_reservation_id
    and r.status = 'PENDING'
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already confirmed or cancelled';
  end if;

  if btrim(coalesce(v_host_confirmation_message, '')) <> '' then
    v_chat := public.create_direct_chat(v_renter_id, v_listing_id);
    v_chat_id := nullif(v_chat ->> 'id', '')::uuid;

    if v_chat_id is not null then
      insert into public.chat_messages (sender_id, chat_id, contents)
      values (v_uid, v_chat_id, btrim(v_host_confirmation_message));
    end if;
  end if;

  return to_jsonb(result);
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.delete_chat(
  p_chat_id uuid
) returns boolean as $$
declare
  v_uid uuid := auth.uid()::uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.participant_id = v_uid
  ) then
    raise exception 'You are not a participant in this chat';
  end if;

  delete from public.chats c
  where c.id = p_chat_id;

  return found;
end;
$$ language plpgsql security definer set search_path = '';