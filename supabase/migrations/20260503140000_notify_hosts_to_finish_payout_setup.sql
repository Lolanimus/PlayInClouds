create or replace function public.notify_host_payout_setup_required_on_listing_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_onboarding_complete boolean := false;
  v_payouts_enabled boolean := false;
begin
  if new.owner_id is null then
    return new;
  end if;

  select
    coalesce(hpa.onboarding_complete, false),
    coalesce(hpa.payouts_enabled, false)
  into v_onboarding_complete, v_payouts_enabled
  from public.host_payment_accounts hpa
  where hpa.user_id = new.owner_id;

  if v_onboarding_complete and v_payouts_enabled then
    return new;
  end if;

  perform public.create_notification(
    new.owner_id,
    'host_payout_setup_required',
    'Finish payout setup for your listing',
    format(
      'Set up Stripe payouts in account settings so you can receive money when %s gets booked.',
      coalesce(new.title, 'your listing')
    ),
    '/account-settings',
    'listing',
    new.id::text,
    jsonb_build_object(
      'listing_id', new.id,
      'requires_payout_setup', true
    )
  );

  return new;
end;
$function$;

drop trigger if exists notify_host_payout_setup_required_on_listing_insert on public.listings;
create trigger notify_host_payout_setup_required_on_listing_insert
after insert on public.listings
for each row
execute function public.notify_host_payout_setup_required_on_listing_insert();
