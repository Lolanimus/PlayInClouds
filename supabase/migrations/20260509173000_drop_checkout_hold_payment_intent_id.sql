alter table public.checkout_holds
  drop column if exists stripe_payment_intent_id;
