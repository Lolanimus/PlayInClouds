import Stripe from "npm:stripe";

import {
  finalizeCompletedCheckoutSession,
} from "../_shared/stripe/checkout-finalization.ts";
import { releasePendingHostTransfersForHost } from "../_shared/stripe/host-transfers.ts";
import { errorResponse, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");
const stripeWebhookSigningSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

if (!stripeWebhookSigningSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SIGNING_SECRET.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type GuestPaymentRow = {
  id: string;
  reservation_id: string;
};

type StripeWebhookEventRow = {
  id: string;
  status: "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED";
};

type WebhookProcessResult = {
  reservationId?: string | null;
  guestPaymentId?: string | null;
};

async function findGuestPaymentByPaymentIntentId(service: ReturnType<typeof createServiceClient>, paymentIntentId: string) {
  const { data } = await service
    .from("reservation_guest_payments")
    .select("id, reservation_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  return data as GuestPaymentRow | null;
}

async function findGuestPaymentByChargeId(service: ReturnType<typeof createServiceClient>, chargeId: string) {
  const { data } = await service
    .from("reservation_guest_payments")
    .select("id, reservation_id")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle();

  return data as GuestPaymentRow | null;
}

function getStripeObjectId(event: Stripe.Event) {
  const object = event.data.object as { id?: unknown };
  return typeof object.id === "string" ? object.id : null;
}

async function upsertWebhookEvent(
  service: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  payload: unknown,
) {
  const { data: existing } = await service
    .from("stripe_webhook_events")
    .select("id, status")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  const eventRow = existing as StripeWebhookEventRow | null;

  if (eventRow?.status === "PROCESSED" || eventRow?.status === "IGNORED") {
    return {
      rowId: eventRow.id,
      shouldSkip: true,
    };
  }

  const values = {
    stripe_event_id: event.id,
    stripe_account_id: event.account ?? null,
    event_type: event.type,
    stripe_object_id: getStripeObjectId(event),
    payload,
    status: "RECEIVED" as const,
    error_message: null,
    event_created_at: new Date(event.created * 1000).toISOString(),
    processed_at: null,
  };

  if (eventRow) {
    await service
      .from("stripe_webhook_events")
      .update(values)
      .eq("id", eventRow.id);

    return {
      rowId: eventRow.id,
      shouldSkip: false,
    };
  }

  const { data, error } = await service
    .from("stripe_webhook_events")
    .insert(values)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Could not log Stripe webhook event: ${error?.message ?? "unknown error"}`);
  }

  return {
    rowId: (data as { id: string }).id,
    shouldSkip: false,
  };
}

async function finishWebhookEvent(
  service: ReturnType<typeof createServiceClient>,
  rowId: string,
  status: "PROCESSED" | "FAILED" | "IGNORED",
  args?: {
    reservationId?: string | null;
    guestPaymentId?: string | null;
    errorMessage?: string | null;
  },
) {
  const { error } = await service
    .from("stripe_webhook_events")
    .update({
      status,
      reservation_id: args?.reservationId ?? null,
      guest_payment_id: args?.guestPaymentId ?? null,
      error_message: args?.errorMessage ?? null,
      processed_at: status === "FAILED" ? null : new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) {
    console.error("stripe-webhook: failed to update event log", {
      rowId,
      status,
      error: error.message,
    });
  }
}

async function markCheckoutHoldStatus(
  service: ReturnType<typeof createServiceClient>,
  status: "EXPIRED" | "FAILED" | "CANCELLED",
  filters: { checkoutSessionId?: string; holdId?: string },
) {
  const query = service
    .from("checkout_holds")
    .update({ status })
    .eq("status", "OPEN");

  if (filters.checkoutSessionId) {
    await query.eq("stripe_checkout_session_id", filters.checkoutSessionId);
    return;
  }

  if (filters.holdId) {
    await query.eq("id", filters.holdId);
  }
}

async function handleCheckoutCompleted(service: ReturnType<typeof createServiceClient>, session: Stripe.Checkout.Session): Promise<WebhookProcessResult> {
  const { reservation, guestPaymentId } = await finalizeCompletedCheckoutSession(
    stripe,
    service,
    session,
  );

  return {
    reservationId: reservation.id,
    guestPaymentId,
  };
}

async function handleCheckoutExpired(service: ReturnType<typeof createServiceClient>, session: Stripe.Checkout.Session): Promise<WebhookProcessResult> {
  await markCheckoutHoldStatus(service, "EXPIRED", { checkoutSessionId: session.id });
  return {};
}

async function handlePaymentIntentFailed(
  service: ReturnType<typeof createServiceClient>,
  paymentIntent: Stripe.PaymentIntent,
): Promise<WebhookProcessResult> {
  const paymentIntentId = paymentIntent.id;
  const latestCharge =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id ?? null;

  const reservationId =
    typeof paymentIntent.metadata?.reservation_id === "string"
      ? paymentIntent.metadata.reservation_id
      : null;
  const holdId =
    typeof paymentIntent.metadata?.hold_id === "string"
      ? paymentIntent.metadata.hold_id
      : null;
  const guestPayment = await findGuestPaymentByPaymentIntentId(service, paymentIntentId);

  if (guestPayment ?? reservationId) {
    await service
      .from("reservation_guest_payments")
      .update({
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: latestCharge,
        status: "FAILED",
        last_reconciled_at: new Date().toISOString(),
      })
      .eq("reservation_id", guestPayment?.reservation_id ?? reservationId)
      .neq("status", "PAID");

    return {
      reservationId: guestPayment?.reservation_id ?? reservationId,
      guestPaymentId: guestPayment?.id ?? null,
    };
  }

  if (holdId) {
    await markCheckoutHoldStatus(service, "FAILED", { holdId });
  }

  return {};
}

async function handleChargeRefunded(service: ReturnType<typeof createServiceClient>, charge: Stripe.Charge): Promise<WebhookProcessResult> {
  const fullyRefunded = charge.amount_refunded >= charge.amount;
  const guestPayment = await findGuestPaymentByChargeId(service, charge.id);

  await service
    .from("reservation_guest_payments")
    .update({
      stripe_charge_id: charge.id,
      status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refunded_at: new Date().toISOString(),
      last_reconciled_at: new Date().toISOString(),
    })
    .eq("stripe_charge_id", charge.id);

  return {
    reservationId: guestPayment?.reservation_id ?? null,
    guestPaymentId: guestPayment?.id ?? null,
  };
}

async function handleAccountUpdated(
  service: ReturnType<typeof createServiceClient>,
  account: Stripe.Account,
): Promise<WebhookProcessResult> {
  const accountId = account.id;
  const hostUserId = typeof account.metadata?.host_user_id === "string"
    ? account.metadata.host_user_id
    : null;

  let resolvedHostUserId = hostUserId;

  if (!resolvedHostUserId) {
    const { data: hostAccount } = await service
      .from("host_payment_accounts")
      .select("user_id")
      .eq("stripe_account_id", accountId)
      .maybeSingle();

    resolvedHostUserId = (hostAccount as { user_id: string } | null)?.user_id ?? null;
  }

  if (!resolvedHostUserId) {
    return {};
  }

  await releasePendingHostTransfersForHost({
    stripe,
    hostUserId: resolvedHostUserId,
    accountId,
  });

  return {};
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    console.warn("stripe-webhook: rejected non-POST request", { method: request.method });
    return errorResponse("Method not allowed", 405);
  }

  let loggedEventRowId: string | null = null;
  let service: ReturnType<typeof createServiceClient> | null = null;

  try {
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("stripe-webhook: missing stripe-signature header");
      return errorResponse("Missing Stripe signature", 400);
    }

    const payload = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      stripeWebhookSigningSecret,
    );
    const parsedPayload = JSON.parse(payload) as unknown;

    console.log("stripe-webhook: received event", {
      id: event.id,
      type: event.type,
    });

    service = createServiceClient();
    const loggedEvent = await upsertWebhookEvent(service, event, parsedPayload);
    loggedEventRowId = loggedEvent.rowId;

    if (loggedEvent.shouldSkip) {
      return jsonResponse({ received: true, duplicate: true });
    }

    let eventStatus: "PROCESSED" | "IGNORED" = "IGNORED";
    let processResult: WebhookProcessResult = {};

    switch (event.type) {
      case "checkout.session.completed":
        processResult = await handleCheckoutCompleted(service, event.data.object as Stripe.Checkout.Session);
        eventStatus = "PROCESSED";
        break;
      case "checkout.session.expired":
        processResult = await handleCheckoutExpired(service, event.data.object as Stripe.Checkout.Session);
        eventStatus = "PROCESSED";
        break;
      case "payment_intent.payment_failed":
        processResult = await handlePaymentIntentFailed(service, event.data.object as Stripe.PaymentIntent);
        eventStatus = "PROCESSED";
        break;
      case "charge.refunded":
        processResult = await handleChargeRefunded(service, event.data.object as Stripe.Charge);
        eventStatus = "PROCESSED";
        break;
      case "account.updated":
        processResult = await handleAccountUpdated(
          service,
          event.data.object as Stripe.Account,
        );
        eventStatus = "PROCESSED";
        break;
      default:
        console.log("stripe-webhook: ignored event", {
          id: event.id,
          type: event.type,
        });
        break;
    }

    await finishWebhookEvent(service, loggedEvent.rowId, eventStatus, {
      reservationId: processResult.reservationId ?? null,
      guestPaymentId: processResult.guestPaymentId ?? null,
    });

    console.log("stripe-webhook: processed event", {
      id: event.id,
      type: event.type,
    });

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (service && loggedEventRowId) {
      await finishWebhookEvent(service, loggedEventRowId, "FAILED", {
        errorMessage: message,
      });
    }
    console.error("stripe-webhook: failed", {
      message,
    });
    return errorResponse(message, 400);
  }
});
