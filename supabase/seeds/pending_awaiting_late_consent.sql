do $$
declare
  v_renter_email text := 'jost12.qsc12@gmail.com';
  v_host_email text := 'antox.qscwdv@gmail.com';

  v_renter_id uuid;
  v_host_id uuid;
  v_listing_id uuid;
  v_reservation_id uuid := gen_random_uuid();

  v_now timestamptz := now();
  v_start_at timestamptz := date_trunc('hour', now()) + interval '3 hours';
  v_end_at timestamptz := date_trunc('hour', now()) + interval '6 hours';

  v_price numeric := 40;
  v_total_price double precision;
  v_late_deadline timestamptz;
  v_transitioned_count integer;
begin
  select id into v_renter_id
  from public."user"
  where lower(email) = lower(v_renter_email)
  limit 1;

  if v_renter_id is null then
    raise exception 'Renter user not found: %', v_renter_email;
  end if;

  select id into v_host_id
  from public."user"
  where lower(email) = lower(v_host_email)
  limit 1;

  if v_host_id is null then
    raise exception 'Host user not found: %', v_host_email;
  end if;

  select l.id
  into v_listing_id
  from public.listings l
  where l.owner_id = v_host_id
    and l.address = '20 Euclid Ave, London, ON, Canada'
    and l.title = 'Rehearsal Space in Wortley Village'
  limit 1;

  if v_listing_id is null then
    v_listing_id := gen_random_uuid();

    insert into public.listings (
      id,
      owner_id,
      lat,
      lng,
      address,
      title,
      subtitle,
      category,
      price,
      images,
      description,
      equipment_desc,
      conveniences_desc,
      area_m2,
      cancellation_policy_hours,
      advance_notice_hours,
      timezone,
      host_confirmation_message,
      rules,
      instructions,
      moderation_status,
      status,
      submitted_at,
      reviewed_at,
      reviewed_by,
      created_at,
      updated_at
    )
    values (
      v_listing_id,
      v_host_id,
      42.9577,
      -81.2497,
      '20 Euclid Ave, London, ON, Canada',
      'Rehearsal Space in Wortley Village',
      'Late consent test space',
      'REHEARSAL_SPACE',
      v_price,
      array[
        'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80'
      ],
      'Test listing for late consent flow.',
      'House kit, amps, PA.',
      'Wi-Fi, washroom, parking.',
      35,
      5,
      1,
      'America/Toronto',
      'Thanks for booking.',
      'Respect the room.',
      'Access shared after confirmation.',
      'APPROVED',
      'ACTIVE',
      v_now,
      v_now,
      v_host_id,
      v_now,
      v_now
    );
  else
    update public.listings
    set
      cancellation_policy_hours = 5,
      advance_notice_hours = 1,
      timezone = 'America/Toronto',
      moderation_status = 'APPROVED',
      status = 'ACTIVE',
      updated_at = v_now
    where id = v_listing_id;
  end if;

  delete from public.reservations r
  where r.listing_id = v_listing_id
    and r.renter_id = v_renter_id
    and r.start_at >= v_now
    and r.start_at <= v_now + interval '12 hours';

  v_total_price := (extract(epoch from (v_end_at - v_start_at)) / 3600.0) * v_price;
  v_late_deadline := public.calculate_reservation_late_booking_deadline(v_start_at, 1);

  insert into public.reservations (
    id,
    listing_id,
    renter_id,
    start_at,
    end_at,
    payment_deadline,
    host_preconfirmed_at,
    late_consent_given_at,
    status,
    total_price,
    guests,
    created_at,
    updated_at
  )
  values (
    v_reservation_id,
    v_listing_id,
    v_renter_id,
    v_start_at,
    v_end_at,
    v_late_deadline,
    null,
    null,
    'PENDING'::public.reservation_status,
    v_total_price,
    1,
    v_now,
    v_now
  );

  select public.transition_pending_reservations_to_late_consent()
  into v_transitioned_count;

  if v_transitioned_count < 1 then
    raise exception 'Reservation did not transition to PENDING_AWAITING_LATE_CONSENT';
  end if;

  raise notice 'reservation_id=%', v_reservation_id;
end $$;

select
  r.id,
  r.status,
  r.start_at,
  r.end_at,
  r.payment_deadline,
  r.host_preconfirmed_at,
  r.late_consent_given_at
from public.reservations r
order by r.created_at desc
limit 1;
