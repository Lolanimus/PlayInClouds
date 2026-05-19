create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-chat-email-cooldowns'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-chat-email-cooldowns',
    '10 3 * * *',
    $job$
      delete from public.chat_email_cooldowns
      where coalesce(cooldown_until, last_sent_at, updated_at, created_at) < now() - interval '30 days';
    $job$
  );
end;
$$;
