import Stripe from "npm:stripe";

import {
  finalizeCompletedCheckoutSession,
} from "../_shared/checkout-finalization.ts";
import { errorResponse, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type CheckoutHoldRow = {
  id: string;
  stripe_checkout_session_id: string | null;
  status: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const service = createServiceClient();

    const { data, error } = await service
      .from("checkout_holds")
      .select("id, stripe_checkout_session_id, status")
      .eq("status", "OPEN")
      .not("stripe_checkout_session_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      throw new Error(`Could not load checkout holds: ${error.message}`);
    }

    const holds = (data ?? []) as CheckoutHoldRow[];
    const result = {
      scanned: holds.length,
      finalized: 0,
      expired: 0,
      open: 0,
      failed: 0,
      errors: [] as Array<{ holdId: string; message: string }>,
    };

    for (const hold of holds) {
      if (!hold.stripe_checkout_session_id) continue;

      try {
        const session = await stripe.checkout.sessions.retrieve(
          hold.stripe_checkout_session_id,
          { expand: ["payment_intent.latest_charge.balance_transaction"] },
        );

        if (session.status === "complete") {
          await finalizeCompletedCheckoutSession(stripe, service, session);
          result.finalized += 1;
          continue;
        }

        if (session.status === "expired") {
          const { error: expireError } = await service
            .from("checkout_holds")
            .update({ status: "EXPIRED" })
            .eq("id", hold.id)
            .eq("status", "OPEN");

          if (expireError) {
            throw new Error(`Could not expire checkout hold: ${expireError.message}`);
          }

          result.expired += 1;
          continue;
        }

        result.open += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          holdId: hold.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
