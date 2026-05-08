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
  v_listing_timezone text;
begin
  if date_part('minute', p_start_at) <> 0 or date_part('second', p_start_at) <> 0
     or date_part('minute', p_end_at) <> 0 or date_part('second', p_end_at) <> 0 then
    raise exception 'Reservations must start/end on full hour boundaries';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'Invalid reservation range';
  end if;

  select coalesce(l.timezone, 'UTC')
  into v_listing_timezone
  from public.listings l
  where l.id = p_listing_id;

  if v_listing_timezone is null then
    raise exception 'Listing not found';
  end if;

  v_hour_ts := p_start_at;
  while v_hour_ts < p_end_at loop
    v_weekday := extract(dow from (v_hour_ts at time zone v_listing_timezone))::smallint;
    v_hour := extract(hour from (v_hour_ts at time zone v_listing_timezone))::smallint;

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
