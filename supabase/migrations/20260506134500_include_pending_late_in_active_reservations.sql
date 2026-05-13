create or replace function public.list_user_active_reservations(
  p_renter_id uuid default null
)
returns setof jsonb as $$
declare
  v_uid uuid;
begin
  v_uid := coalesce(p_renter_id, auth.uid());

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select to_jsonb(r)
  from public.reservations r
  where r.renter_id = v_uid
    and r.status in (
      'PENDING'::public.reservation_status,
      'PENDING_LATE'::public.reservation_status,
      'CONFIRMED'::public.reservation_status
    )
    and r.end_at > now()
  order by r.start_at asc;
end;
$$ language plpgsql set search_path = '';
