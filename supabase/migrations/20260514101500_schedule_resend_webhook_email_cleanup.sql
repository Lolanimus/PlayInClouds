create extension if not exists pg_cron;

do $do$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'cleanup-resend-wh-emails'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-resend-wh-emails',
    '0 3 * * *',
    $job$
      delete from public.resend_wh_emails
      where event_created_at < now() - interval '90 days';
    $job$
  );
end;
$do$;
