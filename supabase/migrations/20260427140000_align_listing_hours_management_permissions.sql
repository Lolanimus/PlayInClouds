create or replace function public.upsert_listing_weekly_slot(
  p_listing_id uuid,
  p_weekday smallint,
  p_hour smallint,
  p_price double precision
) returns jsonb as $function$
declare
  result public.listing_weekly_slots%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
  ) then
    raise exception 'Listing not found';
  end if;

  if not public.current_user_can_manage_listing(p_listing_id) then
    raise exception 'Only the listing owner or an admin can update weekly slots';
  end if;

  insert into public.listing_weekly_slots (listing_id, weekday, hour, price)
  values (p_listing_id, p_weekday, p_hour, p_price)
  on conflict (listing_id, weekday, hour)
  do update set
    price = excluded.price
  returning * into result;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

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
$function$ language plpgsql security definer set search_path = '';