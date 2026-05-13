create or replace function public.set_listing_weekly_slots(
  p_listing_id uuid,
  p_slots jsonb
) returns jsonb as $$
declare
  v_count integer;
  v_is_allowed boolean;
  v_changed_keys jsonb := '[]'::jsonb;
  v_changed_hours jsonb := '[]'::jsonb;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'p_slots must be a JSON array';
  end if;

  v_count := coalesce(jsonb_array_length(p_slots), 0);

  if v_count > 168 then
    raise exception 'p_slots cannot contain more than 168 rows, got %', v_count;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision)
    where s.weekday is null
       or s.hour is null
       or s.price is null
       or s.weekday < 0 or s.weekday > 6
       or s.hour < 0 or s.hour > 23
       or s.price <= 0
  ) then
    raise exception 'Each slot must have weekday 0..6, hour 0..23, and price > 0';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision)
    group by s.weekday, s.hour
    having count(*) > 1
  ) then
    raise exception 'Duplicate s (weekday, hour) found in p_slots';
  end if;

  select exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and (
        l.owner_id = auth.uid()
        or public.current_user_is_admin()
      )
  ) into v_is_allowed;

  if not v_is_allowed then
    raise exception 'Only the listing owner or an admin can update weekly slots';
  end if;

  with new_slots as (
    select
      s.weekday,
      s.hour,
      s.price
    from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision)
  ),
  changed as (
    select
      coalesce(o.weekday, n.weekday) as weekday,
      coalesce(o.hour, n.hour) as hour
    from public.listing_weekly_slots o
    full join new_slots n
      on o.listing_id = p_listing_id
     and o.weekday = n.weekday
     and o.hour = n.hour
    where (o.listing_id = p_listing_id and o.price is distinct from n.price)
       or (o.listing_id is null and n.weekday is not null)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', c.weekday,
        'hour', c.hour
      )
      order by c.weekday, c.hour
    ),
    '[]'::jsonb
  )
  into v_changed_keys
  from changed c;

  delete from public.listing_weekly_slots
  where listing_id = p_listing_id;

  insert into public.listing_weekly_slots (listing_id, weekday, hour, price)
  select
    p_listing_id,
    s.weekday,
    s.hour,
    s.price
  from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision);

  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.weekday, s.hour),
    '[]'::jsonb
  )
  into v_changed_hours
  from public.listing_weekly_slots s
  join jsonb_to_recordset(v_changed_keys) as k(weekday smallint, hour smallint)
    on s.listing_id = p_listing_id
   and s.weekday = k.weekday
   and s.hour = k.hour;

  return jsonb_build_object(
    'listing_id', p_listing_id,
    'weekly_slots_saved', v_count,
    'closed_slots', 168 - v_count,
    'changed_count', jsonb_array_length(v_changed_keys),
    'changed_hours', v_changed_hours
  );
end;
$$ language plpgsql set search_path = '';

drop policy if exists listing_weekly_slots_owner_manage on public.listing_weekly_slots;
create policy listing_weekly_slots_owner_manage
  on public.listing_weekly_slots
  for all
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_weekly_slots.listing_id
        and (
          l.owner_id = auth.uid()
          or public.current_user_is_admin()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.listings l
      where l.id = listing_weekly_slots.listing_id
        and (
          l.owner_id = auth.uid()
          or public.current_user_is_admin()
        )
    )
  );

create or replace function public.current_user_can_manage_listing(
  p_listing_id uuid
) returns boolean
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
    from public.listings l
    where l.id = p_listing_id
      and (
        l.owner_id = v_uid
        or public.current_user_is_admin()
      )
  );
end;
$function$;

grant execute on function public.current_user_can_manage_listing(uuid) to authenticated, service_role;

create or replace function public.upsert_listing_booking_policy(
  p_listing_id uuid,
  p_policy jsonb default '{}'::jsonb
) returns jsonb as $function$
declare
  v_existing public.listing_booking_policies%rowtype;
  v_instant_booking boolean;
  v_min_past_bookings integer;
  v_min_reviews integer;
  v_require_id_verified boolean;
  v_extra_rules jsonb;
  v_policy jsonb;
  result public.listing_booking_policies%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.listings l where l.id = p_listing_id) then
    raise exception 'Listing not found';
  end if;

  if not public.current_user_can_manage_listing(p_listing_id) then
    raise exception 'Only the listing owner or an admin can update booking policy';
  end if;

  v_policy := coalesce(p_policy, '{}'::jsonb);

  if jsonb_typeof(v_policy) <> 'object' then
    raise exception 'p_policy must be a JSON object';
  end if;

  select *
  into v_existing
  from public.listing_booking_policies p
  where p.listing_id = p_listing_id;

  v_instant_booking := coalesce(
    (v_policy ->> 'instant_booking')::boolean,
    v_existing.instant_booking,
    false
  );

  v_min_past_bookings :=
    case
      when v_policy ? 'min_past_bookings' then (v_policy ->> 'min_past_bookings')::integer
      else v_existing.min_past_bookings
    end;

  v_min_reviews :=
    case
      when v_policy ? 'min_reviews' then (v_policy ->> 'min_reviews')::integer
      else v_existing.min_reviews
    end;

  v_require_id_verified := coalesce(
    (v_policy ->> 'require_id_verified')::boolean,
    v_existing.require_id_verified,
    false
  );

  v_extra_rules :=
    case
      when v_policy ? 'extra_rules' then coalesce(v_policy -> 'extra_rules', '{}'::jsonb)
      else coalesce(v_existing.extra_rules, '{}'::jsonb)
    end;

  if v_min_past_bookings is not null and v_min_past_bookings < 0 then
    raise exception 'min_past_bookings must be >= 0';
  end if;

  if v_min_reviews is not null and v_min_reviews < 0 then
    raise exception 'min_reviews must be >= 0';
  end if;

  if jsonb_typeof(v_extra_rules) <> 'object' then
    raise exception 'extra_rules must be a JSON object';
  end if;

  insert into public.listing_booking_policies (
    listing_id,
    instant_booking,
    min_past_bookings,
    min_reviews,
    require_id_verified,
    extra_rules
  ) values (
    p_listing_id,
    v_instant_booking,
    v_min_past_bookings,
    v_min_reviews,
    v_require_id_verified,
    v_extra_rules
  )
  on conflict (listing_id)
  do update set
    instant_booking = excluded.instant_booking,
    min_past_bookings = excluded.min_past_bookings,
    min_reviews = excluded.min_reviews,
    require_id_verified = excluded.require_id_verified,
    extra_rules = excluded.extra_rules
  returning * into result;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

drop policy if exists listing_booking_policies_owner_manage on public.listing_booking_policies;
create policy listing_booking_policies_owner_manage
on public.listing_booking_policies
for all
using (public.current_user_can_manage_listing(listing_id))
with check (public.current_user_can_manage_listing(listing_id));

create or replace function public.set_listing_weekly_slots(
  p_listing_id uuid,
  p_slots jsonb
) returns jsonb as $function$
declare
  v_count integer;
  v_changed_keys jsonb := '[]'::jsonb;
  v_changed_hours jsonb := '[]'::jsonb;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'p_slots must be a JSON array';
  end if;

  v_count := coalesce(jsonb_array_length(p_slots), 0);

  if v_count > 168 then
    raise exception 'p_slots cannot contain more than 168 rows, got %', v_count;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision)
    where s.weekday is null
       or s.hour is null
       or s.price is null
       or s.weekday < 0 or s.weekday > 6
       or s.hour < 0 or s.hour > 23
       or s.price <= 0
  ) then
    raise exception 'Each slot must have weekday 0..6, hour 0..23, and price > 0';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision)
    group by s.weekday, s.hour
    having count(*) > 1
  ) then
    raise exception 'Duplicate s (weekday, hour) found in p_slots';
  end if;

  if not public.current_user_can_manage_listing(p_listing_id) then
    raise exception 'Only the listing owner or an admin can update weekly slots';
  end if;

  with new_slots as (
    select
      s.weekday,
      s.hour,
      s.price
    from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision)
  ),
  changed as (
    select
      coalesce(o.weekday, n.weekday) as weekday,
      coalesce(o.hour, n.hour) as hour
    from public.listing_weekly_slots o
    full join new_slots n
      on o.listing_id = p_listing_id
     and o.weekday = n.weekday
     and o.hour = n.hour
    where (o.listing_id = p_listing_id and o.price is distinct from n.price)
       or (o.listing_id is null and n.weekday is not null)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', c.weekday,
        'hour', c.hour
      )
      order by c.weekday, c.hour
    ),
    '[]'::jsonb
  )
  into v_changed_keys
  from changed c;

  delete from public.listing_weekly_slots
  where listing_id = p_listing_id;

  insert into public.listing_weekly_slots (listing_id, weekday, hour, price)
  select
    p_listing_id,
    s.weekday,
    s.hour,
    s.price
  from jsonb_to_recordset(p_slots) as s(weekday smallint, hour smallint, price double precision);

  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.weekday, s.hour),
    '[]'::jsonb
  )
  into v_changed_hours
  from public.listing_weekly_slots s
  join jsonb_to_recordset(v_changed_keys) as k(weekday smallint, hour smallint)
    on s.listing_id = p_listing_id
   and s.weekday = k.weekday
   and s.hour = k.hour;

  return jsonb_build_object(
    'listing_id', p_listing_id,
    'weekly_slots_saved', v_count,
    'closed_slots', 168 - v_count,
    'changed_count', jsonb_array_length(v_changed_keys),
    'changed_hours', v_changed_hours
  );
end;
$function$ language plpgsql set search_path = '';

drop policy if exists listing_weekly_slots_owner_manage on public.listing_weekly_slots;
create policy listing_weekly_slots_owner_manage
  on public.listing_weekly_slots
  for all
  using (public.current_user_can_manage_listing(listing_id))
  with check (public.current_user_can_manage_listing(listing_id));

drop policy if exists "listings_update_owner" on public.listings;
create policy "listings_update_owner" on public.listings
  for update using (public.current_user_can_manage_listing(id));

drop policy if exists "listings_delete_owner" on public.listings;
create policy "listings_delete_owner" on public.listings
  for delete using (public.current_user_can_manage_listing(id));

create or replace function public.confirm_reservation_internal(
  p_reservation_id uuid,
  p_require_owner boolean default true
) returns public.reservations as $function$
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

  if p_require_owner and not public.current_user_can_manage_listing(v_listing_id) then
    raise exception 'Only the listing owner or an admin can confirm this reservation';
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
      values (v_owner_id, v_chat_id, btrim(v_host_confirmation_message));
    end if;
  end if;

  return result;
end;
$function$ language plpgsql security definer set search_path = '';

create or replace function public.create_direct_chat(target_user_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  chat_row public.chats%rowtype;
  client_user_id uuid := auth.uid()::uuid;
begin
  if client_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null then
    raise exception 'User with id % does not exist', target_user_id;
  end if;

  if target_user_id = client_user_id then
    raise exception 'Cannot create a direct chat with yourself';
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

drop policy if exists "allow_user_upload_own_images" on storage.objects;
create policy "allow_user_upload_own_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'images'
  and lower((storage.foldername(name))[1]) = 'listings'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.current_user_is_admin()
  )
);

drop policy if exists "allow_user_delete_own_images" on storage.objects;
create policy "allow_user_delete_own_images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'images'
  and lower((storage.foldername(name))[1]) = 'listings'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.current_user_is_admin()
  )
);

create or replace function public.create_reservation(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer default 1
) returns jsonb as $function$
declare
  v_uid uuid;
  v_listing_exists boolean;
  v_listing_status public.listing_moderation_status;
  v_listing_owner_id uuid;
  v_instant_booking boolean := false;
  v_min_past_bookings integer := null;
  v_min_reviews integer := null;
  v_require_id_verified boolean := false;
  v_user_past_bookings integer := 0;
  v_user_reviews integer := 0;
  v_user_id_verified boolean := false;
  v_rules_passed boolean := true;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select l.owner_id, l.moderation_status
  into v_listing_owner_id, v_listing_status
  from public.listings l
  where l.id = p_listing_id;

  v_listing_exists := found;

  if not v_listing_exists then
    raise exception 'Listing not found';
  end if;

  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;

  if v_listing_owner_id = v_uid then
    raise exception 'You cannot book your own listing';
  end if;

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

  select
    coalesce(p.instant_booking, false),
    p.min_past_bookings,
    p.min_reviews,
    coalesce(p.require_id_verified, false)
  into
    v_instant_booking,
    v_min_past_bookings,
    v_min_reviews,
    v_require_id_verified
  from public.listings l
  left join public.listing_booking_policies p on p.listing_id = l.id
  where l.id = p_listing_id;

  if v_instant_booking then
    if v_min_past_bookings is not null then
      select count(*)::integer
      into v_user_past_bookings
      from public.reservations r
      where r.renter_id = v_uid
        and r.status = 'CONFIRMED'
        and r.end_at <= now();

      if v_user_past_bookings < v_min_past_bookings then
        v_rules_passed := false;
      end if;
    end if;

    if v_rules_passed and v_min_reviews is not null then
      select count(*)::integer
      into v_user_reviews
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role;

      if v_user_reviews < v_min_reviews then
        v_rules_passed := false;
      end if;
    end if;

    if v_rules_passed and v_require_id_verified then
      select (u.id_verified_at is not null)
      into v_user_id_verified
      from public."user" u
      where u.id = v_uid;

      if coalesce(v_user_id_verified, false) = false then
        v_rules_passed := false;
      end if;
    end if;
  end if;

  insert into public.reservations (listing_id, renter_id, start_at, end_at, guests, status)
  values (p_listing_id, v_uid, p_start_at, p_end_at, p_guests, 'PENDING')
  returning * into result;

  if v_instant_booking and v_rules_passed then
    select * into result
    from public.confirm_reservation_internal(result.id, false);
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

create or replace function public.cancel_reservation(
  p_reservation_id uuid
) returns jsonb as $function$
declare
  v_uid uuid;
  v_renter_id uuid;
  v_owner_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_cancellation_policy_hours integer;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.renter_id, l.owner_id, r.start_at, r.end_at, l.cancellation_policy_hours
  into v_renter_id, v_owner_id, v_start_at, v_end_at, v_cancellation_policy_hours
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_renter_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_uid <> v_renter_id and v_uid <> v_owner_id then
    raise exception 'Only renter or listing owner can cancel this reservation';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be cancelled';
  end if;

  if v_uid = v_renter_id and v_uid <> v_owner_id then
    if v_start_at <= now() then
      raise exception 'Ongoing reservations cannot be cancelled by renter';
    end if;

    if v_cancellation_policy_hours is not null
       and now() > (v_start_at - make_interval(hours => v_cancellation_policy_hours)) then
      raise exception 'Cancellation window has ended for this reservation';
    end if;
  end if;

  update public.reservations r
  set status = 'CANCELLED'
  where r.id = p_reservation_id
    and r.status <> 'CANCELLED'
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already cancelled';
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';
