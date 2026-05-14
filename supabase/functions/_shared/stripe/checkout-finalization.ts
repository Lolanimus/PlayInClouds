import Stripe from "npm:stripe";

import { createServiceClient } from "./supabase.ts";

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

export type FinalizedCheckoutResult = {
  reservation: ReservationRow;
  reservationPaymentId: string | null;
};

type PaymentIntentReconciliation = {
  chargeId: string | null;
  authorizationExpiresAt: string | null;
  balanceTransactionId: string | null;
  hostStripeAccountId: string | null;
  stripeTransferId: string | null;
};

export function calculatePaymentDeadline(basePaymentDeadline: string, authorizationExpiresAt: string | null) {
  const basePaymentDeadlineMs = new Date(basePaymentDeadline).getTime();

  if (!authorizationExpiresAt) {
    return new Date(basePaymentDeadlineMs).toISOString();
  }

  const authExpiryMs = new Date(authorizationExpiresAt).getTime();
  const safetyBufferMs = 30 * 60 * 1000;

  return new Date(Math.min(basePaymentDeadlineMs, authExpiryMs - safetyBufferMs)).toISOString();
}

function getPaymentIntentReconciliation(paymentIntent: Stripe.PaymentIntent | null): PaymentIntentReconciliation {
  const latestCharge =
    paymentIntent && typeof paymentIntent.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;
  const balanceTransaction =
    latestCharge && typeof latestCharge.balance_transaction === "object"
      ? latestCharge.balance_transaction
      : null;
  const destination = paymentIntent?.transfer_data?.destination ?? null;
  const transfer = latestCharge
    ? (latestCharge as Stripe.Charge & { transfer?: string | Stripe.Transfer | null }).transfer ?? null
    : null;

  return {
    chargeId:
      latestCharge?.id
      ?? (typeof paymentIntent?.latest_charge === "string" ? paymentIntent.latest_charge : null),
    authorizationExpiresAt:
      latestCharge?.payment_method_details?.card?.capture_before
        ? new Date(latestCharge.payment_method_details.card.capture_before * 1000).toISOString()
        : null,
    balanceTransactionId:
      balanceTransaction?.id
      ?? (latestCharge && typeof latestCharge.balance_transaction === "string" ? latestCharge.balance_transaction : null),
    hostStripeAccountId:
      typeof destination === "string"
        ? destination
        : destination?.id ?? null,
    stripeTransferId:
      typeof transfer === "string"
        ? transfer
        : transfer?.id ?? null,
  };
}

export async function findCheckoutHoldBySessionId(
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

export async function findCheckoutHoldById(
  service: ReturnType<typeof createServiceClient>,
  holdId: string,
) {
  const { data } = await service
    .from("checkout_holds")
    .select("id, listing_id, renter_id, reservation_id")
    .eq("id", holdId)
    .maybeSingle();

  return data as CheckoutHoldRow | null;
}

async function resolveCheckoutHold(
  service: ReturnType<typeof createServiceClient>,
  holdId: string,
  checkoutSessionId: string,
) {
  const byId = await findCheckoutHoldById(service, holdId);

  if (!byId) {
    throw new Error("Checkout hold not found.");
  }

  const bySessionId = await findCheckoutHoldBySessionId(service, checkoutSessionId);

  if (!bySessionId || bySessionId.id !== holdId) {
    throw new Error("Checkout hold not found.");
  }

  return byId;
}

export async function finalizeCompletedCheckoutSession(
  stripe: Stripe,
  service: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session,
  args?: { expectedUserId?: string | null },
): Promise<FinalizedCheckoutResult> {
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

  if (!holdId) {
    throw new Error("Missing hold_id in Checkout Session metadata.");
  }

  if (!hostUserId) {
    throw new Error("Missing host_user_id in Checkout Session metadata.");
  }

  const hold = await resolveCheckoutHold(service, holdId, session.id);

  if (args?.expectedUserId && hold.renter_id !== args.expectedUserId) {
    throw new Error("This checkout session does not belong to the current user.");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    })
    : null;
  const reconciliation = getPaymentIntentReconciliation(paymentIntent);

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
  const hostNetAmount = Math.max(amountTotal - amountPlatformFee, 0);

  const { data: paymentRow, error: paymentError } = await service
    .from("reservation_payments")
    .upsert({
      reservation_id: reservation.id,
      renter_id: hold.renter_id,
      host_user_id: hostUserId,
      listing_id: hold.listing_id,
      host_stripe_account_id: reconciliation.hostStripeAccountId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: reconciliation.chargeId,
      stripe_balance_transaction_id: reconciliation.balanceTransactionId,
      stripe_transfer_id: reconciliation.stripeTransferId,
      amount_subtotal: amountSubtotal,
      amount_platform_fee: amountPlatformFee,
      amount_total: amountTotal,
      host_net_amount: hostNetAmount,
      currency: session.currency ?? "cad",
      status: "AUTH",
      authorized_at: new Date().toISOString(),
      authorization_expires_at: reconciliation.authorizationExpiresAt,
      payout_status: "NOT_STARTED",
      last_reconciled_at: new Date().toISOString(),
    }, {
      onConflict: "reservation_id",
    })
    .select("id")
    .single();

  if (paymentError) {
    throw new Error(`Could not save reservation payment: ${paymentError.message}`);
  }

  const { error: reservationUpdateError } = await service
    .from("reservations")
    .update({
      payment_deadline: calculatePaymentDeadline(reservation.payment_deadline, reconciliation.authorizationExpiresAt),
    })
    .eq("id", reservation.id);

  if (reservationUpdateError) {
    throw new Error("Could not save reservation cancellation deadline.");
  }

  return {
    reservation,
    reservationPaymentId: (paymentRow as { id: string } | null)?.id ?? null,
  };
}
