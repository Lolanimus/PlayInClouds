import supabase from "@/utils/supabase";

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

type CreateCheckoutSessionArgs = {
  listingId: string;
  startAt: string;
  endAt: string;
  guests?: number;
  successPath?: string;
  cancelPath?: string;
};

type CreateCheckoutSessionResponse = {
  holdId: string;
  checkoutSessionId: string;
  checkoutUrl: string | null;
  amountSubtotal: number;
  amountPlatformFee: number;
  amountTotal: number;
  currency: string;
};

type FinalizeCheckoutSessionResponse = {
  reservation: {
    id: string;
    status: string;
    total_price: number;
  };
  created: boolean;
};

async function getAccessTokenOrThrow() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (session?.access_token) {
    return session.access_token;
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

  if (refreshError) {
    throw refreshError;
  }

  if (!refreshData.session?.access_token) {
    throw new Error("Your session expired. Please log in again before checking out.");
  }

  return refreshData.session.access_token;
}

export async function createCheckoutSession(args: CreateCheckoutSessionArgs) {
  const accessToken = await getAccessTokenOrThrow();

  const response = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(args),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (data && typeof data === "object" && "message" in data && typeof data.message === "string")
        ? data.message
        : (data && typeof data === "object" && "error" in data && typeof data.error === "string")
          ? data.error
          : "Could not start checkout. Please try again.",
    );
  }

  return data as CreateCheckoutSessionResponse;
}

export async function finalizeCheckoutSession(checkoutSessionId: string) {
  const accessToken = await getAccessTokenOrThrow();

  const response = await fetch(`${supabaseUrl}/functions/v1/finalize-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      checkoutSessionId,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (data && typeof data === "object" && "message" in data && typeof data.message === "string")
        ? data.message
        : (data && typeof data === "object" && "error" in data && typeof data.error === "string")
          ? data.error
          : "Could not finalize checkout. Please refresh your reservations.",
    );
  }

  return data as FinalizeCheckoutSessionResponse;
}
