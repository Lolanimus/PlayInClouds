create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-chat-email-pending'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-chat-email-pending',
    '25 3 * * *',
    $job$
      delete from public.chat_email_pending
      where email_sent = true
        and updated_at < now() - interval '30 days';
    $job$
  );
end;
$$;
