import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type DuePaymentRow = {
  reservation_id: string;
  stripe_payment_intent_id: string | null;
  reservations: {
    status: string;
    payment_deadline: string;
    start_at: string;
  } | null;
};

async function listDueAuthPayments(service: ReturnType<typeof createServiceClient>) {
  const { data, error } = await service
    .from("reservation_payments")
    .select("reservation_id, stripe_payment_intent_id, reservations!reservation_payments_reservation_id_fkey(status, payment_deadline, start_at)")
    .eq("status", "AUTH")
    .not("stripe_payment_intent_id", "is", null)
    .limit(200);

  if (error) {
    throw new Error(`Could not load due AUTH payments: ${error.message}`);
  }

  const now = Date.now();

  return ((data ?? []) as DuePaymentRow[]).filter((row) => {
    const reservation = row.reservations;

    if (!reservation) return false;

    const paymentDeadlineReached = now >= new Date(reservation.payment_deadline).getTime();
    const startReached = now >= new Date(reservation.start_at).getTime();

    if (reservation.status === "PENDING" || reservation.status === "PENDING_AWAITING_LATE_CONSENT") {
      return paymentDeadlineReached || startReached;
    }

    return paymentDeadlineReached;
  });
}

async function transitionReservationsAwaitingLateConsent(service: ReturnType<typeof createServiceClient>) {
  const { data, error } = await service.rpc("transition_pending_reservations_to_late_consent");

  if (error) {
    throw new Error(`Could not transition pending reservations into late-consent flow: ${error.message}`);
  }

  return typeof data === "number" ? data : 0;
}

async function captureConfirmedPayment(
  service: ReturnType<typeof createServiceClient>,
  payment: DuePaymentRow,
) {
  if (!payment.stripe_payment_intent_id) return false;

  await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);

  const { error } = await service
    .from("reservation_payments")
    .update({
      status: "PAID",
      paid_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
    })
    .eq("reservation_id", payment.reservation_id)
    .eq("status", "AUTH");

  if (error) {
    throw new Error(`Could not persist captured payment: ${error.message}`);
  }

  return true;
}

async function cancelPendingAuthorization(
  service: ReturnType<typeof createServiceClient>,
  payment: DuePaymentRow,
) {
  if (!payment.stripe_payment_intent_id) return false;

  await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);

  const { error } = await service
    .from("reservation_payments")
    .update({
      status: "AUTH_CANCELED",
      canceled_at: new Date().toISOString(),
    })
    .eq("reservation_id", payment.reservation_id)
    .eq("status", "AUTH");

  if (error) {
    throw new Error(`Could not persist canceled authorization: ${error.message}`);
  }

  return true;
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
    const transitionedToLateConsentCount = await transitionReservationsAwaitingLateConsent(service);
    const duePayments = await listDueAuthPayments(service);

    let capturedCount = 0;
    let canceledAuthCount = 0;
    let failedCount = 0;

    for (const payment of duePayments) {
      try {
        if (payment.reservations?.status === "CONFIRMED") {
          if (await captureConfirmedPayment(service, payment)) {
            capturedCount += 1;
          }
          continue;
        }

        if (
          payment.reservations?.status === "PENDING"
          || payment.reservations?.status === "PENDING_AWAITING_LATE_CONSENT"
        ) {
          if (await cancelPendingAuthorization(service, payment)) {
            canceledAuthCount += 1;
          }
        }
      } catch (error) {
        failedCount += 1;
        console.error("process-reservation-payment-deadlines: failed", {
          reservationId: payment.reservation_id,
          status: payment.reservations?.status ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const { data: autoCancelledCount, error: autoCancelError } = await service.rpc("auto_cancel_pending_reservations_for_advance_notice");

    if (autoCancelError) {
      throw new Error(`Could not auto-cancel pending reservations: ${autoCancelError.message}`);
    }

    return jsonResponse({
      transitionedToLateConsentCount,
      scannedCount: duePayments.length,
      capturedCount,
      canceledAuthCount,
      autoCancelledCount: typeof autoCancelledCount === "number" ? autoCancelledCount : 0,
      failedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
