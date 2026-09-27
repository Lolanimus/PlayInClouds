import supabase from "@/utils/supabase";

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

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
    throw new Error("Your session expired. Please log in again.");
  }

  return refreshData.session.access_token;
}

async function callReservationPaymentAction(action: "confirm" | "cancel" | "accept_late", reservationId: string) {
  const accessToken = await getAccessTokenOrThrow();

  const response = await fetch(`${supabaseUrl}/functions/v1/update-reservation-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      reservationId,
      action,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (data && typeof data === "object" && "message" in data && typeof data.message === "string")
        ? data.message
        : (data && typeof data === "object" && "error" in data && typeof data.error === "string")
          ? data.error
          : `Could not ${action} reservation.`,
    );
  }

  return data;
}

export async function confirmReservationWithPayment(reservationId: string) {
  return callReservationPaymentAction("confirm", reservationId);
}

export async function cancelReservationWithPayment(reservationId: string) {
  return callReservationPaymentAction("cancel", reservationId);
}

export async function acceptLateReservationTermsWithPayment(reservationId: string) {
  return callReservationPaymentAction("accept_late", reservationId);
}
