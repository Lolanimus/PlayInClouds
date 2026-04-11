-- Auto-cancel pending reservations once start time has passed

-- 1) Trigger-time safeguard for INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.auto_cancel_started_pending_reservation_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PENDING'::public.reservation_status
     AND NEW.start_at <= NOW() THEN
    NEW.status := 'CANCELLED'::public.reservation_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS auto_cancel_started_pending_reservation
ON public.reservations;

CREATE TRIGGER auto_cancel_started_pending_reservation
BEFORE INSERT OR UPDATE OF status, start_at
ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.auto_cancel_started_pending_reservation_fn();

-- 2) Time-driven auto-cancel (runs every minute)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $do$
DECLARE
  v_job_id BIGINT;
BEGIN
  -- Remove previously scheduled job with the same name (if any)
  FOR v_job_id IN
    SELECT j.jobid
    FROM cron.job j
    WHERE j.jobname = 'auto-cancel-started-pending-reservations'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  -- Schedule fresh job
  PERFORM cron.schedule(
    'auto-cancel-started-pending-reservations',
    '* * * * *',
    $job$
      UPDATE public.reservations
      SET status = 'CANCELLED'::public.reservation_status
      WHERE status = 'PENDING'::public.reservation_status
        AND start_at <= NOW();
    $job$
  );
END;
$do$;
