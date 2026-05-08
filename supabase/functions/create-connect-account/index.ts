import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createAuthedClient, createServiceClient } from "../_shared/supabase.ts";

const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
const defaultCountry = (Deno.env.get("STRIPE_COUNTRY") ?? "CA").toUpperCase();
const stripeApiKey = Deno.env.get("STRIPE_API_KEY");

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
};

function deriveAccountState(account: Stripe.Account) {
  return {
    onboardingComplete: Boolean(account.details_submitted && account.payouts_enabled),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    defaultCurrency: account.default_currency ?? null,
    country: account.country ?? null,
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
      .select("id, email, first_name, last_name")
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

    const account = existingAccount?.stripe_account_id
      ? await stripe.accounts.retrieve(existingAccount.stripe_account_id)
      : (await findExistingStripeAccountForHost(user.id)) ?? await stripe.accounts.create({
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
              product_description: "AirDrums host payouts for listing reservations",
            },
            individual: fullName
              ? {
                  first_name: profile.first_name,
                  last_name: profile.last_name,
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
      ? await stripe.accountLinks.create({
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
        onboardingUrl: onboardingLink?.url ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
