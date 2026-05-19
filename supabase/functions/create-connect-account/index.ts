import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createAuthedClient, createServiceClient } from "../_shared/supabase.ts";

const siteUrl = (Deno.env.get("SITE_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
const publicSiteUrl = (Deno.env.get("VITE_PUBLIC_SITE_URL") ?? siteUrl).replace(/\/+$/, "");
const defaultCountry = (Deno.env.get("STRIPE_COUNTRY") ?? "CA").toUpperCase();
const stripeApiKey = Deno.env.get("STRIPE_API_KEY");
const businessType = "7929";
const businessDescription = "PlayInClouds lets hosts list rehearsal and drumming spaces, accept paid reservations from guests, and receive payouts after completed bookings.";

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type UserRow = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
};

type ConnectAccountState = {
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  defaultCurrency: string | null;
  country: string | null;
  needsIdentityVerificationOnly: boolean;
};

const identityRequirementPatterns = [
  "verification.document",
  "verification.additional_document",
  "proof_of_liveness",
  "id_number",
  "id_numbers.",
  "ssn_last_4",
];

function isIdentityRequirement(requirement: string) {
  return identityRequirementPatterns.some((pattern) => requirement.includes(pattern));
}

function deriveAccountState(account: Stripe.Account) {
  const dueRequirements = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ];
  const uniqueDueRequirements = Array.from(new Set(dueRequirements));
  const needsIdentityVerificationOnly =
    uniqueDueRequirements.length > 0
      && uniqueDueRequirements.every(isIdentityRequirement);
  const canReceiveHostFunds =
    account.capabilities?.transfers === "active"
    && account.payouts_enabled === true;

  return {
    onboardingComplete: canReceiveHostFunds,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    defaultCurrency: account.default_currency ?? null,
    country: account.country ?? null,
    needsIdentityVerificationOnly,
  };
}

async function findExistingStripeAccountForHost(userId: string) {
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.accounts.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const account of page.data) {
      if (account.metadata?.host_user_id === userId) {
        return account;
      }
    }

    if (!page.has_more || page.data.length === 0) {
      break;
    }

    startingAfter = page.data[page.data.length - 1]?.id;
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const authed = createAuthedClient(request);
    const service = createServiceClient();

    const {
      data: { user },
      error: userError,
    } = await authed.auth.getUser();

    if (userError || !user) {
      return errorResponse("Authentication required", 401);
    }

    const requestBody = await request.json().catch(() => ({}));
    const createOnboardingLink = requestBody.createOnboardingLink !== false;
    const refreshOnly = requestBody.refreshOnly === true;
    const openDashboard = requestBody.openDashboard === true;
    const returnPath =
      typeof requestBody.returnPath === "string" && requestBody.returnPath.startsWith("/")
        ? requestBody.returnPath
        : "/account-settings";
    const refreshPath =
      typeof requestBody.refreshPath === "string" && requestBody.refreshPath.startsWith("/")
        ? requestBody.refreshPath
        : returnPath;

    const { data: profileData, error: profileError } = await service
      .from("user")
      .select("id, email, first_name, last_name, phone_number")
      .eq("id", user.id)
      .single();

    const profile = profileData as UserRow | null;

    if (profileError || !profile) {
      return errorResponse("Could not load the host profile", 500);
    }

    const { data: existingAccountData } = await service
      .from("host_payment_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingAccount = existingAccountData as { stripe_account_id: string } | null;
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    const businessProfileUrl = `${publicSiteUrl}/profile/${user.id}`;

    const discoveredExistingAccount = existingAccount?.stripe_account_id
      ? await stripe.accounts.retrieve(existingAccount.stripe_account_id)
      : await findExistingStripeAccountForHost(user.id);

    if (!discoveredExistingAccount && refreshOnly) {
      return jsonResponse({
        account: {
          stripeAccountId: null,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          country: null,
          defaultCurrency: null,
          needsIdentityVerificationOnly: false,
          onboardingUrl: null,
        },
      });
    }

    const account = discoveredExistingAccount ?? await stripe.accounts.create({
      country: defaultCountry,
      email: profile.email ?? user.email ?? undefined,
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
        mcc: businessType,
        url: businessProfileUrl,
        product_description: businessDescription,
      },
      individual: fullName
        ? {
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone_number ?? undefined,
          }
        : profile.phone_number
          ? {
              phone: profile.phone_number,
            }
          : undefined,
      metadata: {
        host_user_id: user.id,
      },
    }, {
      idempotencyKey: `host-connect-account:${user.id}`,
    });

    const state = deriveAccountState(account);

    const { error: upsertError } = await service.from("host_payment_accounts").upsert({
      user_id: user.id,
      stripe_account_id: account.id,
      onboarding_complete: state.onboardingComplete,
      charges_enabled: state.chargesEnabled,
      payouts_enabled: state.payoutsEnabled,
      details_submitted: state.detailsSubmitted,
      country: state.country ?? defaultCountry,
      default_currency: state.defaultCurrency,
    });

    if (upsertError) {
      return errorResponse("Could not save the host payment account", 500);
    }

    const onboardingLink = createOnboardingLink
      ? openDashboard && state.onboardingComplete
        ? await stripe.accounts.createLoginLink(account.id)
        : await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${siteUrl}${refreshPath}?stripe=refresh`,
            return_url: `${siteUrl}${returnPath}?stripe=return`,
            type: "account_onboarding",
            collection_options: {
              fields: "eventually_due",
              future_requirements: "include",
            },
          })
      : null;

    return jsonResponse({
      account: {
        stripeAccountId: account.id,
        onboardingComplete: state.onboardingComplete,
        chargesEnabled: state.chargesEnabled,
        payoutsEnabled: state.payoutsEnabled,
        detailsSubmitted: state.detailsSubmitted,
        country: state.country ?? defaultCountry,
        defaultCurrency: state.defaultCurrency,
        needsIdentityVerificationOnly: state.needsIdentityVerificationOnly,
        onboardingUrl: onboardingLink?.url ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
