import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { releasePendingHostTransfersForHost } from "../_shared/stripe/host-transfers.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type HostTransferHostRow = {
  host_user_id: string;
};

type HostAccountRow = {
  user_id: string;
  stripe_account_id: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const service = createServiceClient();

    const { data: hostTransfers, error: hostTransfersError } = await service
      .from("reservation_host_transfers")
      .select("host_user_id")
      .in("status", ["NOT_READY", "READY", "FAILED"])
      .is("stripe_transfer_id", null);

    if (hostTransfersError) {
      throw new Error(hostTransfersError.message);
    }

    const hostUserIds = Array.from(
      new Set(
        ((hostTransfers ?? []) as HostTransferHostRow[])
          .map((hostTransfer) => hostTransfer.host_user_id)
          .filter(Boolean),
      ),
    ) as string[];

    if (hostUserIds.length === 0) {
      return jsonResponse({
        hostCount: 0,
        transferredCount: 0,
      });
    }

    const { data: hostAccounts, error: hostAccountsError } = await service
      .from("host_payment_accounts")
      .select("user_id, stripe_account_id")
      .in("user_id", hostUserIds);

    if (hostAccountsError) {
      throw new Error(hostAccountsError.message);
    }

    const accountIdsByHost = new Map<string, string>();

    for (const hostAccount of (hostAccounts ?? []) as HostAccountRow[]) {
      if (hostAccount.user_id && hostAccount.stripe_account_id) {
        accountIdsByHost.set(hostAccount.user_id, hostAccount.stripe_account_id);
      }
    }

    let hostCount = 0;
    let transferredCount = 0;

    for (const hostUserId of hostUserIds) {
      const accountId = accountIdsByHost.get(hostUserId);

      if (!accountId) {
        continue;
      }

      hostCount += 1;

      const releaseOutcome = await releasePendingHostTransfersForHost({
        stripe,
        hostUserId,
        accountId,
      }).catch((error) => {
        console.error("releasePendingHostTransfersForHost failed", {
          hostUserId,
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

      if (releaseOutcome) {
        transferredCount += releaseOutcome.transferredCount;
      }
    }

    return jsonResponse({
      hostCount,
      transferredCount,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
