create or replace function public.current_user_can_moderate_listings()
returns boolean
language sql
security definer
set search_path = ''
stable
as $function$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('ADMIN'::public.user_role, 'MODERATOR'::public.user_role)
  );
$function$;

create or replace function public.get_listing(
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result public.listings%rowtype;
  v_uid uuid := auth.uid();
begin
  select *
  into result
  from public.listings l
  where l.id = p_id
    and (
      l.moderation_status = 'APPROVED'::public.listing_moderation_status
      or l.owner_id = v_uid
      or public.current_user_can_moderate_listings()
    );

  return to_jsonb(result);
end;
$function$;

create or replace function public.list_pending_listings()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.current_user_can_moderate_listings() then
    raise exception 'Listing moderation access required';
  end if;

  return query
  select jsonb_build_object(
    'id', l.id,
    'owner_id', l.owner_id,
    'lat', l.lat,
    'lng', l.lng,
    'timezone', l.timezone,
    'address', l.address,
    'title', l.title,
    'subtitle', l.subtitle,
    'rules', l.rules,
    'instructions', l.instructions,
    'host_confirmation_message', l.host_confirmation_message,
    'category', l.category,
    'price', l.price,
    'images', l.images,
    'description', l.description,
    'equipment_desc', l.equipment_desc,
    'conveniences_desc', l.conveniences_desc,
    'area_m2', l.area_m2,
    'cancellation_policy_hours', l.cancellation_policy_hours,
    'advance_notice_hours', l.advance_notice_hours,
    'rating_sum', l.rating_sum,
    'average_rating', l.average_rating,
    'review_count', l.review_count,
    'moderation_status', l.moderation_status,
    'moderation_message', l.moderation_message,
    'submitted_at', l.submitted_at,
    'reviewed_at', l.reviewed_at,
    'reviewed_by', l.reviewed_by,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'owner_name', coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'Host'),
    'owner_email', u.email
  )
  from public.listings l
  left join public."user" u on u.id = l.owner_id
  where l.moderation_status = 'PENDING_APPROVAL'::public.listing_moderation_status
  order by l.submitted_at asc, l.created_at asc;
end;
$function$;

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

  if not public.current_user_can_moderate_listings() then
    raise exception 'Listing moderation access required';
  end if;

  update public.listings l
  set
    moderation_status = 'APPROVED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
  returning * into result;

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  if result.owner_id is not null then
    perform public.create_notification(
      result.owner_id,
      'listing_approved',
      'Listing approved',
      format('%s is now live on AirDrums.', result.title),
      '/host/dashboard',
      'listing',
      result.id::text,
      jsonb_build_object('listing_id', result.id, 'moderation_status', result.moderation_status)
    );
  end if;

  return to_jsonb(result);
end;
$function$;

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

  if not public.current_user_can_moderate_listings() then
    raise exception 'Listing moderation access required';
  end if;

  update public.listings l
  set
    moderation_status = 'REJECTED'::public.listing_moderation_status,
    moderation_message = nullif(btrim(coalesce(p_message, '')), ''),
    reviewed_at = now(),
    reviewed_by = v_uid
  where l.id = p_listing_id
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

revoke all on function public.current_user_can_moderate_listings() from public, anon;
grant execute on function public.current_user_can_moderate_listings() to authenticated, service_role;