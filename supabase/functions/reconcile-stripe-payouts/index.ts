import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { reconcileStripePayoutForConnectedAccount } from "../_shared/stripe-payouts.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type ReservationPaymentAccountRow = {
  host_stripe_account_id: string | null;
};

async function listConnectedAccountsNeedingPayoutReconciliation(
  service: ReturnType<typeof createServiceClient>,
) {
  const { data, error } = await service
    .from("reservation_payments")
    .select("host_stripe_account_id")
    .eq("status", "PAID")
    .in("payout_status", ["NOT_STARTED", "PENDING"])
    .not("host_stripe_account_id", "is", null);

  if (error) {
    throw new Error(`Could not load payments needing payout reconciliation: ${error.message}`);
  }

  const accountIds = new Set<string>();

  for (const row of (data ?? []) as ReservationPaymentAccountRow[]) {
    if (row.host_stripe_account_id) {
      accountIds.add(row.host_stripe_account_id);
    }
  }

  return Array.from(accountIds);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const service = createServiceClient();
    const connectedAccountIds = await listConnectedAccountsNeedingPayoutReconciliation(service);

    let scannedPayoutCount = 0;
    let matchedPaymentCount = 0;

    for (const connectedAccountId of connectedAccountIds) {
      const payouts = await stripe.payouts.list(
        {
          limit: 25,
        },
        {
          stripeAccount: connectedAccountId,
        },
      );

      for (const payout of payouts.data) {
        scannedPayoutCount += 1;

        const result = await reconcileStripePayoutForConnectedAccount({
          service,
          stripe,
          payout,
          connectedAccountId,
        });

        matchedPaymentCount += result.matchedCount;
      }
    }

    return jsonResponse({
      connectedAccountCount: connectedAccountIds.length,
      scannedPayoutCount,
      matchedPaymentCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
