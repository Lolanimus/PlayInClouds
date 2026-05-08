import { createServiceSupabaseClient } from "../clients/supabase";
import { getStripeClient } from "../clients/stripe";
import { throwClientError } from "../lib/client-errors";
import type { ActorContext } from "../lib/authorization";
import type { CreateConnectOnboardingLinkBody } from "../schemas/connect";
import type Stripe from "stripe";

type ConnectActor = ActorContext;

type HostPaymentAccountRecord = {
  user_id: string;
  stripe_account_id: string;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
  default_currency: string | null;
};

type ConnectAccountStatus = {
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
};

type UserProfileRow = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
};

const appUrl = (process.env.APP_URL ?? process.env.VITE_APP_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const stripeCountry = (process.env.STRIPE_COUNTRY ?? "CA").toUpperCase();

function deriveConnectStatus(account: Stripe.Account): ConnectAccountStatus {
  return {
    stripeAccountId: account.id,
    onboardingComplete: Boolean(account.details_submitted && account.payouts_enabled),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
  };
}

async function getHostPaymentAccountRecord(userId: string) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("host_payment_accounts")
    .select("user_id, stripe_account_id, onboarding_complete, charges_enabled, payouts_enabled, details_submitted, country, default_currency")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throwClientError(error, 500, "Failed to load the host Stripe account");
  }

  return (data ?? null) as HostPaymentAccountRecord | null;
}

async function saveHostPaymentAccountRecord(userId: string, status: ConnectAccountStatus) {
  if (!status.stripeAccountId) {
    throwClientError("Stripe account ID is missing", 500);
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("host_payment_accounts")
    .upsert({
      user_id: userId,
      stripe_account_id: status.stripeAccountId,
      onboarding_complete: status.onboardingComplete,
      charges_enabled: status.chargesEnabled,
      payouts_enabled: status.payoutsEnabled,
      details_submitted: status.detailsSubmitted,
      country: status.country,
      default_currency: status.defaultCurrency,
    });

  if (error) {
    throwClientError(error, 500, "Failed to save the host Stripe account");
  }
}

async function getUserProfile(userId: string) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("user")
    .select("id, email, first_name, last_name")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throwClientError(error ?? "User profile not found", 404, "User profile not found");
  }

  return data as UserProfileRow;
}

async function ensureStripeAccountForHost(userId: string) {
  const stripe = getStripeClient();
  const existing = await getHostPaymentAccountRecord(userId);

  if (existing?.stripe_account_id) {
    const account = await stripe.accounts.retrieve(existing.stripe_account_id);
    const status = deriveConnectStatus(account);
    await saveHostPaymentAccountRecord(userId, status);
    return status;
  }

  const profile = await getUserProfile(userId);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();

  const account = await stripe.accounts.create({
    country: stripeCountry,
    email: profile.email ?? undefined,
    business_type: "individual",
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "express" },
    },
    capabilities: {
      transfers: { requested: true },
    },
    business_profile: {
      product_description: "AirDrums host payouts for listing reservations",
    },
    individual: fullName
      ? {
          first_name: profile.first_name,
          last_name: profile.last_name,
        }
      : undefined,
    metadata: {
      host_user_id: userId,
    },
  });

  const status = deriveConnectStatus(account);
  await saveHostPaymentAccountRecord(userId, status);
  return status;
}

export async function getConnectAccountStatusService(args: {
  actor: ConnectActor;
}) {
  const stripe = getStripeClient();
  const record = await getHostPaymentAccountRecord(args.actor.userId);

  if (!record?.stripe_account_id) {
    return {
      stripeAccountId: null,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      country: null,
      defaultCurrency: null,
      onboardingUrl: null,
    };
  }

  const account = await stripe.accounts.retrieve(record.stripe_account_id);
  const status = deriveConnectStatus(account);
  await saveHostPaymentAccountRecord(args.actor.userId, status);

  return {
    ...status,
    onboardingUrl: null,
  };
}

export async function createConnectOnboardingLinkService(args: {
  actor: ConnectActor;
  input: CreateConnectOnboardingLinkBody;
}) {
  const stripe = getStripeClient();
  const status = await ensureStripeAccountForHost(args.actor.userId);

  const returnPath = args.input.returnPath ?? "/account-settings";
  const refreshPath = args.input.refreshPath ?? returnPath;

  const accountLink = await stripe.accountLinks.create({
    account: status.stripeAccountId!,
    refresh_url: `${appUrl}${refreshPath}?stripe=refresh`,
    return_url: `${appUrl}${returnPath}?stripe=return`,
    type: "account_onboarding",
    collection_options: {
      fields: "eventually_due",
      future_requirements: "include",
    },
  });

  return {
    ...status,
    onboardingUrl: accountLink.url,
  };
}
