create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-email-dispatch-keys'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-email-dispatch-keys',
    '0 3 * * *',
    $job$
      delete from public.email_dispatch_keys
      where created_at < now() - interval '90 days';
    $job$
  );
end;
$$;
