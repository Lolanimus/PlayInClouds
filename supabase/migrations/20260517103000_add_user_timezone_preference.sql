alter table public."user"
  add column if not exists preferred_time_zone text;

update public."user"
set preferred_time_zone = null
where preferred_time_zone is not null
  and btrim(preferred_time_zone) = '';

alter table public."user"
  drop constraint if exists user_preferred_time_zone_valid;

alter table public."user"
  add constraint user_preferred_time_zone_valid
  check (
    preferred_time_zone is null
    or preferred_time_zone = public.assert_valid_timezone(preferred_time_zone)
  );

create or replace function public.get_current_user_time_zone_preference()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_preferred_time_zone text;
begin
  if v_uid is not null then
    select u.preferred_time_zone
    into v_preferred_time_zone
    from public."user" u
    where u.id = v_uid;
  end if;

  return jsonb_build_object(
    'preferred_time_zone', v_preferred_time_zone
  );
end;
$function$;

create or replace function public.update_current_user_time_zone_preference(
  p_time_zone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_next_time_zone text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_next_time_zone := case
    when p_time_zone is null then null
    when btrim(p_time_zone) = '' then null
    else public.assert_valid_timezone(p_time_zone)
  end;

  update public."user" u
  set
    preferred_time_zone = v_next_time_zone,
    updated_at = now()
  where u.id = v_uid
  returning u.preferred_time_zone into v_next_time_zone;

  return jsonb_build_object(
    'preferred_time_zone', v_next_time_zone
  );
end;
$function$;

grant execute on function public.get_current_user_time_zone_preference() to anon, authenticated, service_role;
grant execute on function public.update_current_user_time_zone_preference(text) to authenticated, service_role;
