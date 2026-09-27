import supabase from "@/utils/supabase";

export type ConnectAccountStatus = {
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  needsIdentityVerificationOnly: boolean;
  onboardingUrl: string | null;
};

export async function getConnectAccountStatus() {
  const { data, error } = await supabase.functions.invoke("create-connect-account", {
    body: {
      createOnboardingLink: false,
      refreshOnly: true,
    },
  });

  if (error) {
    throw error;
  }

  return (data as { account: ConnectAccountStatus }).account;
}

export async function createConnectOnboardingLink(args?: {
  returnPath?: string;
  refreshPath?: string;
  openDashboard?: boolean;
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
