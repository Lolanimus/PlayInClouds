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
  reservationId?: string;
  action?: "confirm" | "cancel" | "accept_late";
};

type ReservationPaymentRow = {
  reservation_id: string;
  stripe_payment_intent_id: string | null;
  status: string;
};

type ReservationAccessRow = {
  id: string;
  renter_id: string;
  listing_id: string;
  owner_id: string | null;
  cancellation_policy_hours: number | null;
  status: string;
  start_at: string;
  end_at: string;
  payment_deadline: string;
  late_consent_given_at: string | null;
  host_preconfirmed_at: string | null;
};

async function getReservationAccess(
  service: ReturnType<typeof createServiceClient>,
  reservationId: string,
) {
  const { data, error } = await service
    .from("reservations")
    .select("id, renter_id, listing_id, status, start_at, end_at, payment_deadline, late_consent_given_at, host_preconfirmed_at")
    .eq("id", reservationId)
    .single();

  if (error || !data) {
    console.error("getReservationAccess: reservation lookup failed", {
      reservationId,
      error: error?.message ?? null,
    });
    return null;
  }

  const row = data as {
    id: string;
    renter_id: string;
    listing_id: string;
    status: string;
    start_at: string;
    end_at: string;
    payment_deadline: string;
    late_consent_given_at: string | null;
    host_preconfirmed_at: string | null;
  };

  const { data: listingData, error: listingError } = await service
    .from("listings")
    .select("owner_id, cancellation_policy_hours")
    .eq("id", row.listing_id)
    .single();

  if (listingError || !listingData) {
    console.error("getReservationAccess: listing lookup failed", {
      reservationId,
      listingId: row.listing_id,
      error: listingError?.message ?? null,
    });
    return null;
  }

  return {
    id: row.id,
    renter_id: row.renter_id,
    listing_id: row.listing_id,
    owner_id: (listingData as { owner_id: string | null }).owner_id,
    cancellation_policy_hours: (listingData as { cancellation_policy_hours: number | null }).cancellation_policy_hours,
    status: row.status,
    start_at: row.start_at,
    end_at: row.end_at,
    payment_deadline: row.payment_deadline,
    late_consent_given_at: row.late_consent_given_at,
    host_preconfirmed_at: row.host_preconfirmed_at,
  } as ReservationAccessRow;
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

    if (!body.reservationId || !body.action) {
      return errorResponse("reservationId and action are required", 400);
    }

    const reservation = await getReservationAccess(service, body.reservationId);

    if (!reservation) {
      return errorResponse("Reservation not found", 404);
    }

    const { data: paymentData } = await service
      .from("reservation_guest_payments")
      .select("reservation_id, stripe_payment_intent_id, status")
      .eq("reservation_id", body.reservationId)
      .maybeSingle();

    const payment = paymentData as ReservationPaymentRow | null;

    if (body.action === "confirm") {
      if (reservation.owner_id !== user.id) {
        return errorResponse("Only the listing owner can confirm this reservation", 403);
      }

      if (reservation.status === "CANCELLED") {
        return errorResponse("Cancelled reservations cannot be confirmed", 400);
      }

      if (new Date(reservation.start_at).getTime() <= Date.now()) {
        return errorResponse("Reservations that have already started cannot be confirmed", 400);
      }

      if (new Date(reservation.end_at).getTime() <= Date.now()) {
        return errorResponse("Past reservations cannot be confirmed", 400);
      }

      if (new Date(reservation.payment_deadline).getTime() <= Date.now()) {
        return errorResponse("This reservation expired before it was confirmed", 400);
      }

      const { data: result, error: confirmError } = await authed.rpc("confirm_reservation", {
        p_reservation_id: body.reservationId,
      });

      if (confirmError || !result) {
        return errorResponse(confirmError?.message ?? "Could not confirm reservation", 400);
      }

      return jsonResponse(result);
    }

    if (body.action === "accept_late") {
      if (reservation.renter_id !== user.id) {
        return errorResponse("Only the renter can accept late request terms", 403);
      }

      if (reservation.status !== "PENDING_AWAITING_LATE_CONSENT") {
        return errorResponse("This reservation is not waiting for late-request consent", 400);
      }

      if (new Date(reservation.start_at).getTime() <= Date.now()) {
        return errorResponse("Reservations that have already started cannot be updated", 400);
      }

      if (new Date(reservation.payment_deadline).getTime() <= Date.now()) {
        return errorResponse("This late request has already expired", 400);
      }

      const { data: result, error: acceptError } = await authed.rpc("accept_late_reservation_terms", {
        p_reservation_id: body.reservationId,
      });

      if (acceptError || !result) {
        return errorResponse(acceptError?.message ?? "Could not continue this late request", 400);
      }

      return jsonResponse(result);
    }

    if (reservation.renter_id !== user.id && reservation.owner_id !== user.id) {
      return errorResponse("Only the renter or listing owner can cancel this reservation", 403);
    }

    if (
      reservation.renter_id === user.id
      && reservation.owner_id !== user.id
      && reservation.cancellation_policy_hours === null
    ) {
      return errorResponse("The guest cannot cancel this reservation", 403);
    }

    if (
      reservation.late_consent_given_at
      && reservation.renter_id === user.id
      && reservation.owner_id !== user.id
    ) {
      return errorResponse("You can no longer cancel this reservation after accepting late-request terms", 403);
    }

    if (new Date(reservation.start_at).getTime() <= Date.now()) {
      return errorResponse("Reservations that have already started cannot be cancelled", 400);
    }

    if (new Date(reservation.payment_deadline).getTime() <= Date.now()) {
      return errorResponse("This reservation can no longer be cancelled", 400);
    }

    if (payment?.status === "AUTH" && payment.stripe_payment_intent_id) {
      await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);

      const { error: paymentUpdateError } = await service
        .from("reservation_guest_payments")
        .update({
          status: "AUTH_CANCELED",
          canceled_at: new Date().toISOString(),
          last_reconciled_at: new Date().toISOString(),
        })
        .eq("reservation_id", body.reservationId)
        .eq("status", "AUTH");

      if (paymentUpdateError) {
        return errorResponse("Authorization was released, but the payment record could not be updated", 500);
      }
    }

    const { data: result, error: cancelError } = await authed.rpc("cancel_reservation", {
      p_reservation_id: body.reservationId,
    });

    if (cancelError || !result) {
      return errorResponse(cancelError?.message ?? "Could not cancel reservation", 400);
    }

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
