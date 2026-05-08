import { getAccessToken, requestBackend } from "./shared";

export type ConnectAccountStatus = {
  stripeAccountId: string | null;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  country: string | null;
  defaultCurrency: string | null;
  onboardingUrl: string | null;
};

export async function getConnectAccountStatus() {
  const accessToken = await getAccessToken("You must be logged in to view payout onboarding.");
  const payload = await requestBackend<{ account: ConnectAccountStatus }>({
    path: "/api/connect/account",
    accessToken,
    fallbackMessage: "Failed to get Stripe onboarding status",
  });

  return payload.account;
}

export async function createConnectOnboardingLink(args?: {
  returnPath?: string;
  refreshPath?: string;
}) {
  const accessToken = await getAccessToken("You must be logged in to continue payout onboarding.");
  const payload = await requestBackend<{ account: ConnectAccountStatus }>({
    path: "/api/connect/account/onboarding-link",
    method: "POST",
    body: args ?? {},
    accessToken,
    fallbackMessage: "Failed to create Stripe onboarding link",
  });

  return payload.account;
}
