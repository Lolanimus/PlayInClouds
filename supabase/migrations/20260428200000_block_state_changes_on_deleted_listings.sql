-- Prevent state changes (confirm, cancel, approve, reject, book) on reservations
-- and listings that have been soft-deleted.  Without these guards the functions
-- still succeed and fire notifications even though the listing is gone.
--
-- Affected functions patched here:
--   • create_reservation         – checked moderation_status but not record status
--   • confirm_reservation_internal – no status check on listing
--   • cancel_reservation         – no status check; notifications fired regardless
--   • approve_listing            – no status check on listing
--   • reject_listing             – no status check on listing
--
-- Not affected (already safe):
--   • create_message             – checks c.status = 'ACTIVE'
--   • create_reservation_review  – checks l.status = 'ACTIVE'

-- ── create_reservation ────────────────────────────────────────────────────────
create or replace function public.create_reservation(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests integer default 1
) returns jsonb as $function$
declare
  v_uid uuid;
  v_listing_exists boolean;
  v_listing_status public.listing_moderation_status;
  v_listing_record_status public.record_status;
  v_listing_owner_id uuid;
  v_listing_title text;
  v_confirm_by_at timestamptz;
  v_instant_booking boolean := false;
  v_min_past_bookings integer := null;
  v_min_reviews integer := null;
  v_require_id_verified boolean := false;
  v_user_past_bookings integer := 0;
  v_user_reviews integer := 0;
  v_user_id_verified boolean := false;
  v_rules_passed boolean := true;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    l.owner_id,
    l.moderation_status,
    l.status,
    l.title,
    public.calculate_advance_notice_start_at(
      coalesce(l.timezone, 'UTC'),
      l.advance_notice_hours,
      now()
    )
  into v_listing_owner_id, v_listing_status, v_listing_record_status, v_listing_title, v_confirm_by_at
  from public.listings l
  where l.id = p_listing_id;

  v_listing_exists := found;

  if not v_listing_exists then
    raise exception 'Listing not found';
  end if;

  if v_listing_record_status = 'DELETED'::public.record_status then
    raise exception 'Listing not found';
  end if;

  if v_listing_status <> 'APPROVED'::public.listing_moderation_status then
    raise exception 'This listing is not available for booking yet';
  end if;

  if v_listing_owner_id = v_uid then
    raise exception 'You cannot book your own listing';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_listing_id::text));

  if exists (
    select 1
    from public.reservations r
    where r.listing_id = p_listing_id
      and r.status in ('PENDING', 'CONFIRMED')
      and tstzrange(r.start_at, r.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'This time slot is no longer available. Please choose another time.';
  end if;

  select
    coalesce(p.instant_booking, false),
    p.min_past_bookings,
    p.min_reviews,
    coalesce(p.require_id_verified, false)
  into
    v_instant_booking,
    v_min_past_bookings,
    v_min_reviews,
    v_require_id_verified
  from public.listings l
  left join public.listing_booking_policies p on p.listing_id = l.id
  where l.id = p_listing_id;

  if v_instant_booking then
    if v_min_past_bookings is not null then
      select count(*)::integer
      into v_user_past_bookings
      from public.reservations r
      where r.renter_id = v_uid
        and r.status = 'CONFIRMED'
        and r.end_at <= now();

      if v_user_past_bookings < v_min_past_bookings then
        v_rules_passed := false;
      end if;
    end if;

    if v_rules_passed and v_min_reviews is not null then
      select count(*)::integer
      into v_user_reviews
      from public.reservation_reviews rr
      where rr.reviewer_user_id = v_uid
        and rr.reviewer_role = 'BOOKER_TO_HOST'::public.reservation_review_role;

      if v_user_reviews < v_min_reviews then
        v_rules_passed := false;
      end if;
    end if;

    if v_rules_passed and v_require_id_verified then
      select (u.id_verified_at is not null)
      into v_user_id_verified
      from public."user" u
      where u.id = v_uid;

      if coalesce(v_user_id_verified, false) = false then
        v_rules_passed := false;
      end if;
    end if;
  end if;

  insert into public.reservations (
    listing_id,
    renter_id,
    start_at,
    end_at,
    guests,
    status,
    confirm_by_at
  )
  values (
    p_listing_id,
    v_uid,
    p_start_at,
    p_end_at,
    p_guests,
    'PENDING',
    v_confirm_by_at
  )
  returning * into result;

  if v_listing_owner_id is not null and v_listing_owner_id <> v_uid then
    perform public.create_notification(
      v_listing_owner_id,
      'reservation_created',
      'New reservation request',
      format('%s has a new reservation request.', coalesce(v_listing_title, 'Your listing')),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', p_listing_id)
    );
  end if;

  if v_instant_booking and v_rules_passed then
    select * into result
    from public.confirm_reservation_internal(result.id, false);
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

-- ── confirm_reservation_internal ─────────────────────────────────────────────
create or replace function public.confirm_reservation_internal(
  p_reservation_id uuid,
  p_require_owner boolean default true
) returns public.reservations as $function$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_end_at timestamptz;
  v_renter_id uuid;
  v_listing_id uuid;
  v_listing_title text;
  v_host_confirmation_message text;
  v_chat jsonb;
  v_chat_id uuid;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select l.owner_id, r.end_at, r.renter_id, r.listing_id, l.host_confirmation_message, l.title
  into v_owner_id, v_end_at, v_renter_id, v_listing_id, v_host_confirmation_message, v_listing_title
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id
    and l.status = 'ACTIVE'::public.record_status;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if p_require_owner and not public.current_user_can_manage_listing(v_listing_id) then
    raise exception 'Only the listing owner or an admin can confirm this reservation';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be confirmed';
  end if;

  update public.reservations r
  set status = 'CONFIRMED'
  where r.id = p_reservation_id
    and r.status = 'PENDING'
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already confirmed or cancelled';
  end if;

  if v_renter_id is not null and v_renter_id <> v_owner_id then
    perform public.create_notification(
      v_renter_id,
      'reservation_confirmed',
      'Reservation confirmed',
      format('Your reservation for %s has been confirmed.', coalesce(v_listing_title, 'this listing')),
      '/reservation/' || result.id::text,
      'reservation',
      result.id::text,
      jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id)
    );
  end if;

  if btrim(coalesce(v_host_confirmation_message, '')) <> '' and v_renter_id is distinct from v_owner_id then
    v_chat := public.create_direct_chat(v_renter_id, v_listing_id);
    v_chat_id := nullif(v_chat ->> 'id', '')::uuid;

    if v_chat_id is not null then
      insert into public.chat_messages (sender_id, chat_id, contents)
      values (v_owner_id, v_chat_id, btrim(v_host_confirmation_message));
    end if;
  end if;

  return result;
end;
$function$ language plpgsql security definer set search_path = '';

-- ── cancel_reservation ────────────────────────────────────────────────────────
create or replace function public.cancel_reservation(
  p_reservation_id uuid
) returns jsonb as $function$
declare
  v_uid uuid;
  v_renter_id uuid;
  v_owner_id uuid;
  v_listing_id uuid;
  v_listing_title text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_cancellation_policy_hours integer;
  v_listing_deleted boolean := false;
  result public.reservations%rowtype;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select r.renter_id, l.owner_id, r.listing_id, l.title, r.start_at, r.end_at,
         l.cancellation_policy_hours,
         (l.status = 'DELETED'::public.record_status)
  into v_renter_id, v_owner_id, v_listing_id, v_listing_title, v_start_at, v_end_at,
       v_cancellation_policy_hours, v_listing_deleted
  from public.reservations r
  join public.listings l on l.id = r.listing_id
  where r.id = p_reservation_id;

  if v_renter_id is null then
    raise exception 'Reservation not found';
  end if;

  -- Only the renter or owner may cancel; if the listing is deleted only an
  -- admin can still force-cancel (e.g. during clean-up).
  if v_uid <> v_renter_id and v_uid <> v_owner_id then
    raise exception 'Only renter or listing owner can cancel this reservation';
  end if;

  if v_listing_deleted and not public.current_user_can_view_deleted_rows() then
    raise exception 'This listing has been removed';
  end if;

  if v_end_at <= now() then
    raise exception 'Past reservations cannot be cancelled';
  end if;

  if v_uid = v_renter_id and v_uid <> v_owner_id then
    if v_start_at <= now() then
      raise exception 'Ongoing reservations cannot be cancelled by renter';
    end if;

    if v_cancellation_policy_hours is not null
       and now() > (v_start_at - make_interval(hours => v_cancellation_policy_hours)) then
      raise exception 'Cancellation window has ended for this reservation';
    end if;
  end if;

  update public.reservations r
  set status = 'CANCELLED'
  where r.id = p_reservation_id
    and r.status <> 'CANCELLED'
  returning * into result;

  if result.id is null then
    raise exception 'Reservation is already cancelled';
  end if;

  -- Only send notifications when the listing is still active (i.e. both
  -- parties have a meaningful context for the message).
  if not v_listing_deleted then
    if v_uid = v_renter_id and v_owner_id is not null and v_owner_id <> v_uid then
      perform public.create_notification(
        v_owner_id,
        'reservation_cancelled',
        'Reservation cancelled',
        format('A reservation for %s was cancelled by the guest.', coalesce(v_listing_title, 'your listing')),
        '/reservation/' || result.id::text,
        'reservation',
        result.id::text,
        jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id)
      );
    elsif v_uid = v_owner_id and v_renter_id is not null and v_renter_id <> v_uid then
      perform public.create_notification(
        v_renter_id,
        'reservation_cancelled',
        'Reservation cancelled',
        format('Your reservation for %s was cancelled by the host.', coalesce(v_listing_title, 'this listing')),
        '/reservation/' || result.id::text,
        'reservation',
        result.id::text,
        jsonb_build_object('reservation_id', result.id, 'listing_id', v_listing_id)
      );
    end if;
  end if;

  return to_jsonb(result);
end;
$function$ language plpgsql security definer set search_path = '';

-- ── approve_listing ───────────────────────────────────────────────────────────
create or replace function public.approve_listing(
  p_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  result public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.listings l
  set
    moderation_status = 'APPROVED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
    and l.status = 'ACTIVE'::public.record_status
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  if result.owner_id is not null then
    perform public.create_notification(
      result.owner_id,
      'listing_approved',
      'Listing approved',
      format('%s is now live on PlayInClouds.', result.title),
      '/host/dashboard',
      'listing',
      result.id::text,
      jsonb_build_object('listing_id', result.id, 'moderation_status', result.moderation_status)
    );
  end if;

  return to_jsonb(result);
end;
$function$;

-- ── reject_listing ────────────────────────────────────────────────────────────
create or replace function public.reject_listing(
  p_listing_id uuid,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  result public.listings%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.listings l
  set
    moderation_status = 'REJECTED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
    and l.status = 'ACTIVE'::public.record_status
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  if result.owner_id is not null then
    perform public.create_notification(
      result.owner_id,
      'listing_rejected',
      'Listing rejected',
      coalesce(nullif(result.moderation_message, ''), format('%s needs updates before it can go live.', result.title)),
      '/host/edit-listing/' || result.id::text,
      'listing',
      result.id::text,
      jsonb_build_object('listing_id', result.id, 'moderation_status', result.moderation_status)
    );
  end if;

  return to_jsonb(result);
end;
$function$;
