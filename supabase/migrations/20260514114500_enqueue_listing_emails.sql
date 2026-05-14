create or replace function public.enqueue_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_email text;
  v_owner_first_name text;
  v_owner_last_name text;
  v_transition text;
begin
  select u.email, u.first_name, u.last_name
  into v_owner_email, v_owner_first_name, v_owner_last_name
  from public."user" u
  where u.id = new.owner_id;

  if v_owner_email is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.enqueue_email(
      'listing_created',
      'owner',
      new.owner_id,
      v_owner_email,
      jsonb_build_object(
        'listing_id', new.id,
        'listing_title', new.title,
        'owner_first_name', v_owner_first_name,
        'owner_last_name', v_owner_last_name,
        'moderation_message', new.moderation_message
      ),
      'listing-created-' || new.id::text || '-owner'
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_transition := old.moderation_status::text || '-' || new.moderation_status::text;

    if v_transition not in (
      'PENDING_APPROVAL-APPROVED',
      'PENDING_APPROVAL-REJECTED'
    ) then
      return new;
    end if;

    perform public.enqueue_email(
      'listing_status_changed',
      'owner',
      new.owner_id,
      v_owner_email,
      jsonb_build_object(
        'listing_id', new.id,
        'listing_title', new.title,
        'owner_first_name', v_owner_first_name,
        'owner_last_name', v_owner_last_name,
        'moderation_message', new.moderation_message,
        'status_transition', v_transition
      ),
      'listing-status-' || new.id::text || '-' || v_transition || '-owner'
    );

    return new;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enqueue_listing_created on public.listings;
create trigger trg_enqueue_listing_created
after insert on public.listings
for each row
execute function public.enqueue_listing();

drop trigger if exists trg_enqueue_listing_status_transition on public.listings;
create trigger trg_enqueue_listing_status_transition
after update on public.listings
for each row
when (old.moderation_status is distinct from new.moderation_status)
execute function public.enqueue_listing();
