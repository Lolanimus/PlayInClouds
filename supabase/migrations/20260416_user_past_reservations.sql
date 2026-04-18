create or replace function public.list_user_past_reservations(
  p_renter_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 6
)
returns setof jsonb as $$
declare
  v_uid uuid;
  v_offset integer;
begin
  v_uid := coalesce(p_renter_id, auth.uid());

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_page < 1 then
    raise exception 'p_page must be greater than 0';
  end if;

  if p_page_size < 1 then
    raise exception 'p_page_size must be greater than 0';
  end if;

  v_offset := (p_page - 1) * p_page_size;

  return query
  select to_jsonb(r)
  from public.reservations r
  where r.renter_id = v_uid
    and r.end_at <= now()
  order by r.end_at desc, r.start_at desc
  limit p_page_size
  offset v_offset;
end;
$$ language plpgsql set search_path = '';

create or replace function public.count_user_past_reservations(
  p_renter_id uuid default null
)
returns integer as $$
declare
  v_uid uuid;
begin
  v_uid := coalesce(p_renter_id, auth.uid());

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return (
    select count(*)::integer
    from public.reservations r
    where r.renter_id = v_uid
      and r.end_at <= now()
  );
end;
$$ language plpgsql set search_path = '';