import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
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

function calculatePaymentDeadline(basePaymentDeadline: string, authorizationExpiresAt: string | null) {
  const basePaymentDeadlineMs = new Date(basePaymentDeadline).getTime();

  if (!authorizationExpiresAt) {
    return new Date(basePaymentDeadlineMs).toISOString();
  }

  const authExpiryMs = new Date(authorizationExpiresAt).getTime();
  const safetyBufferMs = 30 * 60 * 1000;

  return new Date(Math.min(basePaymentDeadlineMs, authExpiryMs - safetyBufferMs)).toISOString();
}

async function findCheckoutHoldBySessionId(
  service: ReturnType<typeof createServiceClient>,
  checkoutSessionId: string,
) {
  const { data } = await service
    .from("checkout_holds")
    .select("id, listing_id, renter_id, reservation_id")
    .eq("stripe_checkout_session_id", checkoutSessionId)
    .maybeSingle();

  return data as CheckoutHoldRow | null;
}

async function finalizeCheckoutSession(
  service: ReturnType<typeof createServiceClient>,
  checkoutSessionId: string,
  userId: string,
) {
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ["payment_intent.latest_charge"],
  });

  if (session.status !== "complete") {
    throw new Error("Checkout session is not complete yet.");
  }

  const holdId =
    typeof session.metadata?.hold_id === "string"
      ? session.metadata.hold_id
      : null;
  const hostUserId =
    typeof session.metadata?.host_user_id === "string"
      ? session.metadata.host_user_id
      : null;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const chargeId =
    typeof session.payment_intent === "object" && session.payment_intent?.latest_charge
      ? typeof session.payment_intent.latest_charge === "string"
        ? session.payment_intent.latest_charge
        : session.payment_intent.latest_charge.id
      : null;
  const authorizationExpiresAt =
    typeof session.payment_intent === "object" &&
    typeof session.payment_intent.latest_charge === "object" &&
    session.payment_intent.latest_charge?.payment_method_details?.card?.capture_before
      ? new Date(session.payment_intent.latest_charge.payment_method_details.card.capture_before * 1000).toISOString()
      : null;

  if (!holdId) {
    throw new Error("Missing hold_id in Checkout Session metadata.");
  }

  if (!hostUserId) {
    throw new Error("Missing host_user_id in Checkout Session metadata.");
  }

  const hold = await findCheckoutHoldBySessionId(service, checkoutSessionId);

  if (!hold || hold.id !== holdId) {
    throw new Error("Checkout hold not found.");
  }

  if (hold.renter_id !== userId) {
    throw new Error("This checkout session does not belong to the current user.");
  }

  let reservation: ReservationRow | null = null;

  if (hold.reservation_id) {
    const { data } = await service
      .from("reservations")
      .select("id, status, total_price, payment_deadline")
      .eq("id", hold.reservation_id)
      .single();

    reservation = data as ReservationRow | null;
  } else {
    const { data, error } = await service.rpc("create_reservation_from_checkout_hold", {
      p_hold_id: holdId,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Could not create reservation from checkout hold.");
    }

    reservation = data as ReservationRow;
  }

  if (!reservation) {
    throw new Error("Reservation was not created after checkout.");
  }

  const amountSubtotal = Math.round(reservation.total_price * 100);
  const amountTotal = session.amount_total ?? amountSubtotal;
  const amountPlatformFee = Math.max(amountTotal - amountSubtotal, 0);

  const { error: paymentError } = await service
    .from("reservation_payments")
    .upsert({
      reservation_id: reservation.id,
      renter_id: hold.renter_id,
      host_user_id: hostUserId,
      listing_id: hold.listing_id,
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
    throw new Error("Could not save reservation payment.");
  }

  const { error: reservationUpdateError } = await service
    .from("reservations")
    .update({
      payment_deadline: calculatePaymentDeadline(reservation.payment_deadline, authorizationExpiresAt),
    })
    .eq("id", reservation.id);

  if (reservationUpdateError) {
    throw new Error("Could not save reservation cancellation deadline.");
  }

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
