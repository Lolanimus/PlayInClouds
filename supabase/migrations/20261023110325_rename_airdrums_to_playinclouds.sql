-- Apply the PlayInClouds brand to future listing-approval notifications while
-- preserving the existing migration history.
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

-- Update previously generated notification copy without changing its metadata.
update public.notifications
set body = replace(body, 'AirDrums', 'PlayInClouds')
where body like '%AirDrums%';
