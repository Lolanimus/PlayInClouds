create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-audit-log'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-audit-log',
    '20 3 * * *',
    $job$
      delete from public.audit_log
      where occurred_at < now() - interval '365 days';
    $job$
  );
end;
$$;
