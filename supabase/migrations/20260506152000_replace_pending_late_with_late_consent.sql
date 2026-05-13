do $$
begin
  alter type public.reservation_status add value if not exists 'PENDING_AWAITING_LATE_CONSENT';
exception
  when duplicate_object then null;
end
$$;
