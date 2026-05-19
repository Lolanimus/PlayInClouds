import Stripe from "npm:stripe";

import { createServiceClient } from "../supabase.ts";

type HostTransferRow = {
  id: string;
  guest_payment_id: string;
  reservation_id: string;
  host_user_id: string;
  host_stripe_account_id: string | null;
  amount: number;
  currency: string;
  transfer_group: string | null;
  status: "NOT_READY" | "READY" | "TRANSFERRED" | "FAILED" | "REVERSED";
  stripe_transfer_id: string | null;
};

type GuestPaymentRow = {
  id: string;
  reservation_id: string;
  host_user_id: string;
  amount_total: number;
  amount_platform_fee: number;
  currency: string;
  stripe_charge_id: string | null;
  status: string;
};

export function canReceiveHostFunds(account: Stripe.Account) {
  return account.capabilities?.transfers === "active"
    && account.payouts_enabled === true;
}

export async function ensureHostTransfer(args: {
  guestPaymentId: string;
}) {
  const service = createServiceClient();

  const { data: guestPayment, error: guestPaymentError } = await service
    .from("reservation_guest_payments")
    .select("id, reservation_id, host_user_id, amount_total, amount_platform_fee, currency, status")
    .eq("id", args.guestPaymentId)
    .single();

  if (guestPaymentError || !guestPayment) {
    throw new Error(guestPaymentError?.message ?? "Could not load guest payment");
  }

  const payment = guestPayment as GuestPaymentRow;

  if (payment.status !== "PAID") {
    return {
      hostTransferId: null,
      hostUserId: payment.host_user_id,
      accountId: null,
    };
  }

  const { data: hostAccount } = await service
    .from("host_payment_accounts")
    .select("stripe_account_id")
    .eq("user_id", payment.host_user_id)
    .maybeSingle();

  const accountId = (hostAccount as { stripe_account_id: string | null } | null)?.stripe_account_id ?? null;
  const amount = Math.max(payment.amount_total - payment.amount_platform_fee, 0);
  const transferGroup = `reservation:${payment.reservation_id}`;

  const { data: existingTransfer } = await service
    .from("reservation_host_transfers")
    .select("id, stripe_transfer_id")
    .eq("guest_payment_id", payment.id)
    .maybeSingle();

  if (!existingTransfer) {
    const { data: hostTransfer, error: hostTransferError } = await service
      .from("reservation_host_transfers")
      .insert({
        guest_payment_id: payment.id,
        reservation_id: payment.reservation_id,
        host_user_id: payment.host_user_id,
        host_stripe_account_id: accountId,
        amount,
        currency: payment.currency,
        transfer_group: transferGroup,
        status: "NOT_READY",
      })
      .select("id")
      .single();

    if (hostTransferError || !hostTransfer) {
      throw new Error(hostTransferError?.message ?? "Could not create host transfer");
    }

    return {
      hostTransferId: (hostTransfer as { id: string }).id,
      hostUserId: payment.host_user_id,
      accountId,
    };
  }

  const { error: updateError } = await service
    .from("reservation_host_transfers")
    .update({
      host_stripe_account_id: accountId,
      amount,
      currency: payment.currency,
      transfer_group: transferGroup,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (existingTransfer as { id: string }).id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    hostTransferId: (existingTransfer as { id: string }).id,
    hostUserId: payment.host_user_id,
    accountId,
  };
}

export async function releaseHostTransfer(args: {
  stripe: Stripe;
  hostTransferId: string;
  accountId: string;
}) {
  const service = createServiceClient();

  const { data: hostTransfer, error: hostTransferError } = await service
    .from("reservation_host_transfers")
    .select("*")
    .eq("id", args.hostTransferId)
    .single();

  if (hostTransferError || !hostTransfer) {
    return { ok: false, reason: "not_found" } as const;
  }

  const transfer = hostTransfer as HostTransferRow;

  if (transfer.stripe_transfer_id || transfer.status === "TRANSFERRED") {
    return { ok: true, reason: "already_transferred" } as const;
  }

  if (transfer.status === "REVERSED") {
    return { ok: false, reason: "reversed" } as const;
  }

  const { data: guestPayment, error: guestPaymentError } = await service
    .from("reservation_guest_payments")
    .select("id, stripe_charge_id, status")
    .eq("id", transfer.guest_payment_id)
    .single();

  if (guestPaymentError || !guestPayment) {
    await service
      .from("reservation_host_transfers")
      .update({
        status: "FAILED",
        failure_reason: guestPaymentError?.message ?? "guest_payment_not_found",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transfer.id);

    return { ok: false, reason: "guest_payment_not_found" } as const;
  }

  const payment = guestPayment as Pick<GuestPaymentRow, "id" | "stripe_charge_id" | "status">;

  if (payment.status !== "PAID" || !payment.stripe_charge_id) {
    await service
      .from("reservation_host_transfers")
      .update({
        status: "FAILED",
        failure_reason: "guest_payment_not_transferable",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transfer.id);

    return { ok: false, reason: "guest_payment_not_transferable" } as const;
  }

  await service
    .from("reservation_host_transfers")
    .update({
      status: "READY",
      host_stripe_account_id: args.accountId,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transfer.id);

  try {
    const stripeTransfer = await args.stripe.transfers.create(
      {
        amount: transfer.amount,
        currency: transfer.currency,
        destination: args.accountId,
        source_transaction: payment.stripe_charge_id,
        transfer_group: transfer.transfer_group ?? `reservation:${transfer.reservation_id}`,
        metadata: {
          host_transfer_id: transfer.id,
          guest_payment_id: transfer.guest_payment_id,
          reservation_id: transfer.reservation_id,
          host_user_id: transfer.host_user_id,
        },
      },
      {
        idempotencyKey: `host-transfer:${transfer.id}`,
      },
    );

    const { data: updatedTransfer, error: updateError } = await service
      .from("reservation_host_transfers")
      .update({
        status: "TRANSFERRED",
        host_stripe_account_id: args.accountId,
        stripe_transfer_id: stripeTransfer.id,
        transferred_at: new Date().toISOString(),
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transfer.id)
      .is("stripe_transfer_id", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw new Error(`Transfer succeeded in Stripe but could not be saved locally: ${updateError.message}`);
    }

    if (!updatedTransfer) {
      throw new Error("Transfer succeeded in Stripe but no reservation_host_transfers row was updated");
    }

    return {
      ok: true,
      reason: "transferred",
      transferId: stripeTransfer.id,
    } as const;
  } catch (error) {
    await service
      .from("reservation_host_transfers")
      .update({
        status: "FAILED",
        host_stripe_account_id: args.accountId,
        failure_reason: error instanceof Error ? error.message : "transfer_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transfer.id)
      .is("stripe_transfer_id", null);

    throw error;
  }
}

export async function releasePendingHostTransfersForHost(args: {
  stripe: Stripe;
  hostUserId: string;
  accountId: string;
}) {
  const service = createServiceClient();

  const stripeAccount = await args.stripe.accounts.retrieve(args.accountId);
  const eligible = canReceiveHostFunds(stripeAccount);

  if (!eligible) {
    return {
      ok: true,
      reason: "account_not_ready",
      pendingCount: 0,
      transferredCount: 0,
    } as const;
  }

  const { data: hostTransfers, error: hostTransfersError } = await service
    .from("reservation_host_transfers")
    .select("id")
    .eq("host_user_id", args.hostUserId)
    .in("status", ["NOT_READY", "READY", "FAILED"])
    .is("stripe_transfer_id", null);

  if (hostTransfersError) {
    throw new Error(hostTransfersError.message);
  }

  let transferredCount = 0;

  for (const hostTransfer of hostTransfers ?? []) {
    const releaseOutcome = await releaseHostTransfer({
      stripe: args.stripe,
      hostTransferId: (hostTransfer as { id: string }).id,
      accountId: args.accountId,
    }).catch((error) => {
      console.error("releaseHostTransfer failed", {
        hostTransferId: (hostTransfer as { id: string }).id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (releaseOutcome?.ok && releaseOutcome.reason === "transferred") {
      transferredCount += 1;
    }
  }

  return {
    ok: true,
    reason: "processed",
    pendingCount: hostTransfers?.length ?? 0,
    transferredCount,
  } as const;
}
