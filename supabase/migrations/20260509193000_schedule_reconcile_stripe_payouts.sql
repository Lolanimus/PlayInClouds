create extension if not exists pg_net;
create extension if not exists pg_cron;

do $do$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'reconcile-stripe-payouts'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'reconcile-stripe-payouts',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/reconcile-stripe-payouts',
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
