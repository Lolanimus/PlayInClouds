import Stripe from "npm:stripe";

import { createServiceClient } from "./supabase.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

type ReservationPaymentIdentityRow = {
  id: string;
  reservation_id: string;
};

export type PayoutReconciliationResult = {
  matchedCount: number;
  reservationId: string | null;
  reservationPaymentId: string | null;
  payoutStatus: "PENDING" | "PAID" | "FAILED";
};

function toIsoFromUnix(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Date(value * 1000).toISOString();
}

function mapStripePayoutStatus(status: Stripe.Payout.Status): "PENDING" | "PAID" | "FAILED" {
  if (status === "paid") return "PAID";
  if (status === "failed" || status === "canceled") return "FAILED";
  return "PENDING";
}

function getBalanceTransactionSourceId(
  transaction: Stripe.BalanceTransaction,
) {
  if (!transaction.source) return null;

  return typeof transaction.source === "string"
    ? transaction.source
    : transaction.source.id;
}

async function listPayoutSourceIds(
  stripe: Stripe,
  connectedAccountId: string,
  payoutId: string,
) {
  const transactions = await stripe.balanceTransactions.list(
    {
      payout: payoutId,
      limit: 100,
    },
    {
      stripeAccount: connectedAccountId,
    },
  );

  return transactions.data
    .map(getBalanceTransactionSourceId)
    .filter((value): value is string => Boolean(value));
}

function dedupeReservationPaymentRows(rows: ReservationPaymentIdentityRow[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function findReservationPaymentsForPayout(
  service: ServiceClient,
  connectedAccountId: string,
  payoutId: string,
  sourceIds: string[],
) {
  const rows: ReservationPaymentIdentityRow[] = [];

  if (sourceIds.length > 0) {
    const { data } = await service
      .from("reservation_payments")
      .select("id, reservation_id")
      .eq("host_stripe_account_id", connectedAccountId)
      .in("stripe_transfer_id", sourceIds);

    rows.push(...((data ?? []) as ReservationPaymentIdentityRow[]));
  }

  const { data: existingByPayout } = await service
    .from("reservation_payments")
    .select("id, reservation_id")
    .eq("host_stripe_account_id", connectedAccountId)
    .eq("stripe_payout_id", payoutId);

  rows.push(...((existingByPayout ?? []) as ReservationPaymentIdentityRow[]));

  return dedupeReservationPaymentRows(rows);
}

export async function reconcileStripePayoutForConnectedAccount(args: {
  service: ServiceClient;
  stripe: Stripe;
  payout: Stripe.Payout;
  connectedAccountId: string;
}) {
  const { service, stripe, payout, connectedAccountId } = args;
  const sourceIds = await listPayoutSourceIds(stripe, connectedAccountId, payout.id);
  const reservationPayments = await findReservationPaymentsForPayout(
    service,
    connectedAccountId,
    payout.id,
    sourceIds,
  );

  if (reservationPayments.length === 0) {
    return {
      matchedCount: 0,
      reservationId: null,
      reservationPaymentId: null,
      payoutStatus: mapStripePayoutStatus(payout.status),
    } satisfies PayoutReconciliationResult;
  }

  const payoutStatus = mapStripePayoutStatus(payout.status);
  const paidOutAt = payoutStatus === "PAID"
    ? toIsoFromUnix(payout.arrival_date) ?? new Date().toISOString()
    : null;
  const payoutFailureReason =
    payoutStatus === "FAILED"
      ? payout.failure_message ?? payout.failure_code ?? payout.status
      : null;

  const reservationPaymentIds = reservationPayments.map((row) => row.id);

  const { error } = await service
    .from("reservation_payments")
    .update({
      stripe_payout_id: payout.id,
      payout_status: payoutStatus,
      payout_failure_reason: payoutFailureReason,
      paid_out_at: paidOutAt,
      last_reconciled_at: new Date().toISOString(),
    })
    .in("id", reservationPaymentIds);

  if (error) {
    throw new Error(`Could not reconcile payout ${payout.id}: ${error.message}`);
  }

  return {
    matchedCount: reservationPayments.length,
    reservationId: reservationPayments[0]?.reservation_id ?? null,
    reservationPaymentId: reservationPayments[0]?.id ?? null,
    payoutStatus,
  } satisfies PayoutReconciliationResult;
}
