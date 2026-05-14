create extension if not exists pg_cron;

create or replace function public.enqueue_review_reminder()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prompt record;
  v_created_count integer := 0;
begin
  for v_prompt in
    with eligible as (
      select
        r.id as reservation_id,
        r.listing_id,
        l.title as listing_title,
        coalesce(l.timezone, 'UTC') as listing_time_zone,
        r.start_at,
        r.end_at,
        r.end_at + interval '14 days' as expires_at,
        r.renter_id,
        renter.email as renter_email,
        renter.first_name as renter_first_name,
        renter.last_name as renter_last_name,
        l.owner_id as host_user_id,
        host.email as host_email,
        host.first_name as host_first_name,
        host.last_name as host_last_name
      from public.reservations r
      join public.listings l on l.id = r.listing_id
      join public."user" renter on renter.id = r.renter_id
      join public."user" host on host.id = l.owner_id
      where r.status = 'CONFIRMED'::public.reservation_status
        and r.end_at <= now()
        and r.end_at > now() - interval '14 days'
        and l.status = 'ACTIVE'::public.record_status
    )
    select
      'booker'::text as recipient_role,
      e.renter_id as recipient_user_id,
      e.renter_email as recipient_email,
      e.reservation_id,
      e.listing_id,
      e.listing_title,
      e.listing_time_zone,
      e.start_at,
      e.end_at,
      e.expires_at,
      e.renter_first_name,
      e.renter_last_name,
      e.host_first_name,
      e.host_last_name,
      'review-reminder-' || e.reservation_id::text || '-booker' as dedupe_key
    from eligible e
    where e.renter_email is not null
      and public.can_leave_review(e.renter_id, e.reservation_id)

    union all

    select
      'host'::text as recipient_role,
      e.host_user_id as recipient_user_id,
      e.host_email as recipient_email,
      e.reservation_id,
      e.listing_id,
      e.listing_title,
      e.listing_time_zone,
      e.start_at,
      e.end_at,
      e.expires_at,
      e.renter_first_name,
      e.renter_last_name,
      e.host_first_name,
      e.host_last_name,
      'review-reminder-' || e.reservation_id::text || '-host' as dedupe_key
    from eligible e
    where e.host_email is not null
      and public.can_leave_review(e.host_user_id, e.reservation_id)
  loop
    perform public.enqueue_email(
      'review_reminder',
      v_prompt.recipient_role,
      v_prompt.recipient_user_id,
      v_prompt.recipient_email,
      jsonb_build_object(
        'reservation_id', v_prompt.reservation_id,
        'listing_id', v_prompt.listing_id,
        'listing_title', v_prompt.listing_title,
        'listing_time_zone', v_prompt.listing_time_zone,
        'start_at', v_prompt.start_at,
        'end_at', v_prompt.end_at,
        'expires_at', v_prompt.expires_at,
        'renter_first_name', v_prompt.renter_first_name,
        'renter_last_name', v_prompt.renter_last_name,
        'host_first_name', v_prompt.host_first_name,
        'host_last_name', v_prompt.host_last_name
      ),
      v_prompt.dedupe_key
    );

    v_created_count := v_created_count + 1;
  end loop;

  return v_created_count;
end;
$function$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'enqueue-review-reminder'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'enqueue-review-reminder',
    '0 9,21 * * *',
    $job$
      select public.enqueue_review_reminder();
    $job$
  );
end;
$$;
