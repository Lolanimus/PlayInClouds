create or replace function public.notify_host_payout_setup_required_on_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_listing_title text;
  v_onboarding_complete boolean := false;
  v_payouts_enabled boolean := false;
begin
  select l.owner_id, l.title
  into v_owner_id, v_listing_title
  from public.listings l
  where l.id = new.listing_id;

  if v_owner_id is null or v_owner_id = new.renter_id then
    return new;
  end if;

  select
    coalesce(hpa.onboarding_complete, false),
    coalesce(hpa.payouts_enabled, false)
  into v_onboarding_complete, v_payouts_enabled
  from public.host_payment_accounts hpa
  where hpa.user_id = v_owner_id;

  if v_onboarding_complete and v_payouts_enabled then
    return new;
  end if;

  perform public.create_notification(
    v_owner_id,
    'host_payout_setup_required',
    'Complete payout setup to receive this booking',
    format(
      'Your listing %s has a booking. Finish Stripe payout setup in account settings before we can send your payout.',
      coalesce(v_listing_title, 'Your listing')
    ),
    '/account-settings',
    'reservation',
    new.id::text,
    jsonb_build_object(
      'reservation_id', new.id,
      'listing_id', new.listing_id,
      'requires_payout_setup', true
    )
  );

  return new;
end;
$function$;

drop trigger if exists notify_host_payout_setup_required_on_reservation_insert on public.reservations;
create trigger notify_host_payout_setup_required_on_reservation_insert
after insert on public.reservations
for each row
execute function public.notify_host_payout_setup_required_on_reservation_insert();
