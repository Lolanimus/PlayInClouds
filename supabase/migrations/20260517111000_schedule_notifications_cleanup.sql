create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-notifications'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-notifications',
    '5 3 * * *',
    $job$
      delete from public.notifications
      where is_read = true
        and coalesce(read_at, created_at) < now() - interval '180 days';
    $job$
  );
end;
$$;
