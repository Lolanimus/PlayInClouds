import supabase from "@/utils/supabase";

export type ConnectAccountStatus = {
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  onboardingUrl: string | null;
};

type HostPaymentAccountRow = {
  stripe_account_id: string;
  onboarding_complete: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
  default_currency: string | null;
};

function mapStatus(account: HostPaymentAccountRow | null): ConnectAccountStatus {
  return {
    stripeAccountId: account?.stripe_account_id ?? null,
    onboardingComplete: account?.onboarding_complete ?? false,
    payoutsEnabled: account?.payouts_enabled ?? false,
    detailsSubmitted: account?.details_submitted ?? false,
    country: account?.country ?? null,
    defaultCurrency: account?.default_currency ?? null,
    onboardingUrl: null,
  };
}

export async function getConnectAccountStatus() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be logged in to view payout onboarding.")
  }

  const { data, error } = await supabase
    .from("host_payment_accounts")
    .select("stripe_account_id, onboarding_complete, payouts_enabled, details_submitted, country, default_currency")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error
  }

  return mapStatus((data as HostPaymentAccountRow | null) ?? null)
}

export async function createConnectOnboardingLink(args?: {
  returnPath?: string;
  refreshPath?: string;
}) {
  const { data, error } = await supabase.functions.invoke("create-connect-account", {
    body: args ?? {},
  });

  if (error) {
    throw error
  }

  return (data as { account: ConnectAccountStatus }).account
}

export async function ensureConnectAccount() {
  const { data, error } = await supabase.functions.invoke("create-connect-account", {
    body: {
      createOnboardingLink: false,
    },
  });

  if (error) {
    throw error
  }

  return (data as { account: ConnectAccountStatus }).account
}
