create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-review-reminder-keys'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-review-reminder-keys',
    '15 3 * * *',
    $job$
      delete from public.review_reminder_keys
      where created_at < now() - interval '30 days';
    $job$
  );
end;
$$;
