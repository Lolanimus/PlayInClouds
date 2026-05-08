import Stripe from "npm:stripe";

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

type CheckoutHoldRow = {
  id: string;
  listing_id: string;
  renter_id: string;
  reservation_id: string | null;
};

type ReservationRow = {
  id: string;
  status: string;
  total_price: number;
  payment_deadline: string;
};

type ReservationPaymentRow = {
  reservation_id: string;
};

function calculatePaymentDeadline(basePaymentDeadline: string, authorizationExpiresAt: string | null) {
  const basePaymentDeadlineMs = new Date(basePaymentDeadline).getTime();

  if (!authorizationExpiresAt) {
    return new Date(basePaymentDeadlineMs).toISOString();
  }

  const authExpiryMs = new Date(authorizationExpiresAt).getTime();
  const safetyBufferMs = 30 * 60 * 1000;

  return new Date(Math.min(basePaymentDeadlineMs, authExpiryMs - safetyBufferMs)).toISOString();
}

async function findReservationPaymentByPaymentIntentId(service: ReturnType<typeof createServiceClient>, paymentIntentId: string) {
  const { data } = await service
    .from("reservation_payments")
    .select("reservation_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  return data as ReservationPaymentRow | null;
}

async function findCheckoutHoldById(service: ReturnType<typeof createServiceClient>, holdId: string) {
  const { data } = await service
    .from("checkout_holds")
    .select("id, listing_id, renter_id, reservation_id")
    .eq("id", holdId)
    .maybeSingle();

  return data as CheckoutHoldRow | null;
}

async function markCheckoutHoldStatus(
  service: ReturnType<typeof createServiceClient>,
  status: "EXPIRED" | "FAILED" | "CANCELLED",
  filters: { checkoutSessionId?: string; paymentIntentId?: string },
) {
  const query = service
    .from("checkout_holds")
    .update({ status })
    .eq("status", "OPEN");

  if (filters.checkoutSessionId) {
    await query.eq("stripe_checkout_session_id", filters.checkoutSessionId);
    return;
  }

  if (filters.paymentIntentId) {
    await query.eq("stripe_payment_intent_id", filters.paymentIntentId);
  }
}

async function handleCheckoutCompleted(service: ReturnType<typeof createServiceClient>, session: Stripe.Checkout.Session) {
  const holdId =
    typeof session.metadata?.hold_id === "string"
      ? session.metadata.hold_id
      : null;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  let chargeId: string | null = null;
  let authorizationExpiresAt: string | null = null;
  let reservation: ReservationRow | null = null;

  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });

    if (typeof paymentIntent.latest_charge === "string") {
      chargeId = paymentIntent.latest_charge;
    } else {
      chargeId = paymentIntent.latest_charge?.id ?? null;
      authorizationExpiresAt =
        paymentIntent.latest_charge?.payment_method_details?.card?.capture_before
          ? new Date(paymentIntent.latest_charge.payment_method_details.card.capture_before * 1000).toISOString()
          : null;
    }
  }

  if (!holdId) {
    throw new Error("Missing hold_id in Checkout Session metadata.");
  }

  const hostUserId =
    typeof session.metadata?.host_user_id === "string"
      ? session.metadata.host_user_id
      : null;

  if (!hostUserId) {
    throw new Error("Missing host_user_id in Checkout Session metadata.");
  }

  const existingHold = await findCheckoutHoldById(service, holdId);

  if (!existingHold) {
    throw new Error("Checkout hold not found.");
  }

  if (existingHold.reservation_id) {
    const { data: existingReservation } = await service
      .from("reservations")
      .select("id, status, total_price, payment_deadline")
      .eq("id", existingHold.reservation_id)
      .single();

    reservation = existingReservation as ReservationRow | null;
  } else {
    const { data: reservationData, error: reservationError } = await service.rpc("create_reservation_from_checkout_hold", {
      p_hold_id: holdId,
    });

    if (reservationError || !reservationData) {
      throw new Error(reservationError?.message ?? "Could not create reservation from checkout hold.");
    }

    reservation = reservationData as ReservationRow;
  }

  if (!reservation) {
    throw new Error("Reservation was not created after payment.");
  }

  const amountSubtotal = Math.round(reservation.total_price * 100);
  const amountTotal = session.amount_total ?? amountSubtotal;
  const amountPlatformFee = Math.max(amountTotal - amountSubtotal, 0);

  const { error: paymentError } = await service
    .from("reservation_payments")
    .upsert({
      reservation_id: reservation.id,
      renter_id: existingHold.renter_id,
      host_user_id: hostUserId,
      listing_id: existingHold.listing_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      amount_subtotal: amountSubtotal,
      amount_platform_fee: amountPlatformFee,
      amount_total: amountTotal,
      currency: session.currency ?? "cad",
      status: "AUTH",
      authorized_at: new Date().toISOString(),
      authorization_expires_at: authorizationExpiresAt,
    }, {
      onConflict: "reservation_id",
    });

  if (paymentError) {
    throw new Error(`Could not save reservation payment: ${paymentError.message}`);
  }

  const { error: reservationUpdateError } = await service
    .from("reservations")
    .update({
      payment_deadline: calculatePaymentDeadline(reservation.payment_deadline, authorizationExpiresAt),
    })
    .eq("id", reservation.id);

  if (reservationUpdateError) {
    throw new Error(`Could not save reservation cancellation deadline: ${reservationUpdateError.message}`);
  }
}

async function handleCheckoutExpired(service: ReturnType<typeof createServiceClient>, session: Stripe.Checkout.Session) {
  await markCheckoutHoldStatus(service, "EXPIRED", { checkoutSessionId: session.id });
}

async function handlePaymentIntentFailed(
  service: ReturnType<typeof createServiceClient>,
  paymentIntent: Stripe.PaymentIntent,
) {
  const paymentIntentId = paymentIntent.id;
  const latestCharge =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id ?? null;

  const reservationId =
    typeof paymentIntent.metadata?.reservation_id === "string"
      ? paymentIntent.metadata.reservation_id
      : null;
  const reservationPayment = await findReservationPaymentByPaymentIntentId(service, paymentIntentId);

  if (reservationPayment ?? reservationId) {
    await service
      .from("reservation_payments")
      .update({
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: latestCharge,
        status: "FAILED",
      })
      .eq("reservation_id", reservationPayment?.reservation_id ?? reservationId)
      .neq("status", "PAID");

    return;
  }

  await markCheckoutHoldStatus(service, "FAILED", { paymentIntentId });
}

async function handleChargeRefunded(service: ReturnType<typeof createServiceClient>, charge: Stripe.Charge) {
  const fullyRefunded = charge.amount_refunded >= charge.amount;

  await service
    .from("reservation_payments")
    .update({
      stripe_charge_id: charge.id,
      status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refunded_at: new Date().toISOString(),
    })
    .eq("stripe_charge_id", charge.id);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    console.warn("stripe-webhook: rejected non-POST request", { method: request.method });
    return errorResponse("Method not allowed", 405);
  }

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

    console.log("stripe-webhook: received event", {
      id: event.id,
      type: event.type,
    });

    const service = createServiceClient();

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(service, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(service, event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(service, event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleChargeRefunded(service, event.data.object as Stripe.Charge);
        break;
      default:
        console.log("stripe-webhook: ignored event", {
          id: event.id,
          type: event.type,
        });
        break;
    }

    console.log("stripe-webhook: processed event", {
      id: event.id,
      type: event.type,
    });

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-webhook: failed", {
      message,
    });
    return errorResponse(message, 400);
  }
});
