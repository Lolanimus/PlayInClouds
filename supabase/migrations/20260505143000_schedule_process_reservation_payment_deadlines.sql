create extension if not exists pg_net;
create extension if not exists pg_cron;

do $do$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname in (
      'auto-cancel-started-pending-reservations',
      'capture-due-reservation-payments',
      'process-reservation-payment-deadlines'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'process-reservation-payment-deadlines',
    '* * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/process-reservation-payment-deadlines',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'anon_key'
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$do$;
