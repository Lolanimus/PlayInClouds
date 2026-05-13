import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  finalizeCompletedCheckoutSession,
} from "../_shared/checkout-finalization.ts";
import { createAuthedClient, createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type RequestBody = {
  checkoutSessionId?: string;
};

async function finalizeCheckoutSession(
  service: ReturnType<typeof createServiceClient>,
  checkoutSessionId: string,
  userId: string,
) {
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ["payment_intent.latest_charge.balance_transaction"],
  });

  if (session.status !== "complete") {
    throw new Error("Checkout session is not complete yet.");
  }
  const { reservation } = await finalizeCompletedCheckoutSession(
    stripe,
    service,
    session,
    { expectedUserId: userId },
  );

  return reservation;
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

    const body = await request.json() as RequestBody;

    if (!body.checkoutSessionId) {
      return errorResponse("checkoutSessionId is required", 400);
    }

    const reservation = await finalizeCheckoutSession(service, body.checkoutSessionId, user.id);

    return jsonResponse({
      reservation,
      created: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
