create or replace function public.sync_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public."user" as existing_user (
    id,
    email,
    phone_number,
    first_name,
    last_name
  )
  values (
    new.id,
    new.email,
    nullif(new.phone, ''),
    coalesce(nullif(new.raw_user_meta_data->>'first_name', ''), 'Unknown'),
    coalesce(nullif(new.raw_user_meta_data->>'last_name', ''), 'Unknown')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    phone_number = excluded.phone_number,
    first_name = coalesce(
      nullif(new.raw_user_meta_data->>'first_name', ''),
      existing_user.first_name
    ),
    last_name = coalesce(
      nullif(new.raw_user_meta_data->>'last_name', ''),
      existing_user.last_name
    );

  return new;
end;
$function$;

drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_updated
after update of email, phone, raw_user_meta_data on auth.users
for each row
execute function public.sync_user_from_auth();
