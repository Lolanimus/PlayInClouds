do $$
begin
  alter type public.reservation_status add value if not exists 'PENDING_LATE';
exception
  when duplicate_object then null;
end
$$;
