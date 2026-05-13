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

  if result.id is null then
    raise exception 'Listing not found';
  end if;

  return to_jsonb(result);
end;
$function$;