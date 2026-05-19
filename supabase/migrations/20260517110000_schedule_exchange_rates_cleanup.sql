create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'cleanup-exchange-rates'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'cleanup-exchange-rates',
    '0 3 * * *',
    $job$
      delete from public.exchange_rates
      where as_of < current_date - interval '90 days';
    $job$
  );
end;
$$;
