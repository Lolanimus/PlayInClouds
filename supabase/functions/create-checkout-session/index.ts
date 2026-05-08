import Stripe from "npm:stripe";

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createAuthedClient, createServiceClient } from "../_shared/supabase.ts";

const stripeApiKey = Deno.env.get("STRIPE_API_KEY");
const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
const currency = (Deno.env.get("STRIPE_CURRENCY") ?? "cad").toLowerCase();
const platformFeeBps = Number(Deno.env.get("STRIPE_PLATFORM_FEE_BPS") ?? "750");
const checkoutExpiresInSeconds = 30 * 60;

if (!stripeApiKey) {
  throw new Error("Missing STRIPE_API_KEY.");
}

const stripe = new Stripe(stripeApiKey, {
  maxNetworkRetries: 2,
});

type RequestBody = {
  listingId?: string;
  startAt?: string;
  endAt?: string;
  guests?: number;
  successPath?: string;
  cancelPath?: string;
};

type ListingRow = {
  id: string;
  owner_id: string;
  title: string;
  subtitle: string;
  cancellation_policy_hours: number | null;
  advance_notice_hours: number | null;
};

type CheckoutHoldRow = {
  id: string;
  listing_id: string;
  renter_id: string;
  start_at: string;
  end_at: string;
  guests: number;
  expires_at: string;
  stripe_checkout_session_id: string | null;
  status: string;
};

function buildAbsoluteUrl(path: string, fallback: string) {
  const safePath = path.startsWith("/") ? path : fallback;
  return `${siteUrl}${safePath}`;
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${value}`;
}

async function findReusableHold(
  service: ReturnType<typeof createServiceClient>,
  renterId: string,
  listingId: string,
  startAt: string,
  endAt: string,
  guests: number,
) {
  const { data } = await service
    .from("checkout_holds")
    .select("id, listing_id, renter_id, start_at, end_at, guests, expires_at, stripe_checkout_session_id, status")
    .eq("renter_id", renterId)
    .eq("listing_id", listingId)
    .eq("start_at", startAt)
    .eq("end_at", endAt)
    .eq("guests", guests)
    .eq("status", "OPEN")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as CheckoutHoldRow | null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let holdId: string | null = null;

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

    if (!body.listingId || !body.startAt || !body.endAt) {
      return errorResponse("listingId, startAt, and endAt are required", 400);
    }

    const guests = body.guests ?? 1;

    const { data: listingData, error: listingError } = await service
      .from("listings")
      .select("id, owner_id, title, subtitle, cancellation_policy_hours, advance_notice_hours")
      .eq("id", body.listingId)
      .single();

    const listing = listingData as ListingRow | null;

    if (listingError || !listing) {
      return errorResponse("Listing not found", 404);
    }

    if (listing.owner_id === user.id) {
      return errorResponse("Hosts cannot book their own listings", 400);
    }

    const reservationStartAt = new Date(body.startAt);
    const lateBookingDeadlineAt =
      typeof listing.advance_notice_hours === "number"
        ? new Date(reservationStartAt.getTime() - listing.advance_notice_hours * 60 * 60 * 1000)
        : reservationStartAt;

    if (lateBookingDeadlineAt.getTime() <= Date.now()) {
      return errorResponse("This reservation can no longer be booked because the host response deadline has passed", 400);
    }

    const successUrlBase = buildAbsoluteUrl(
      body.successPath ?? "/dashboard?checkout=success",
      "/dashboard?checkout=success",
    );
    const cancelUrl = buildAbsoluteUrl(
      body.cancelPath ?? `/payment?checkout=cancelled&listingId=${listing.id}`,
      `/payment?checkout=cancelled&listingId=${listing.id}`,
    );

    const expiresAtUnix = Math.floor(Date.now() / 1000) + checkoutExpiresInSeconds;
    const expiresAtIso = new Date(expiresAtUnix * 1000).toISOString();
    const { data: totalPriceData, error: totalPriceError } = await authed.rpc("quote_reservation_total", {
      p_listing_id: body.listingId,
      p_start_at: body.startAt,
      p_end_at: body.endAt,
    });

    if (totalPriceError || typeof totalPriceData !== "number") {
      return errorResponse(totalPriceError?.message ?? "Could not price reservation", 400);
    }

    const amountSubtotal = Math.round(totalPriceData * 100);
    const amountPlatformFee = Math.round(amountSubtotal * (platformFeeBps / 10000));
    const amountTotal = amountSubtotal + amountPlatformFee;

    let hold = await findReusableHold(
      service,
      user.id,
      body.listingId,
      body.startAt,
      body.endAt,
      guests,
    );

    if (hold?.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(hold.stripe_checkout_session_id);

      if (existingSession.status === "open" && existingSession.url) {
        return jsonResponse({
          holdId: hold.id,
          checkoutSessionId: existingSession.id,
          checkoutUrl: existingSession.url,
          amountSubtotal,
          amountPlatformFee,
          amountTotal,
          currency,
        });
      }

      await service
        .from("checkout_holds")
        .update({
          status: existingSession.status === "expired" ? "EXPIRED" : "CANCELLED",
        })
        .eq("id", hold.id)
        .eq("status", "OPEN");

      hold = null;
    }

    if (!hold) {
      const { data: holdData, error: holdError } = await authed.rpc("create_checkout_hold", {
        p_listing_id: body.listingId,
        p_start_at: body.startAt,
        p_end_at: body.endAt,
        p_guests: guests,
        p_expires_at: expiresAtIso,
      });

      if (holdError || !holdData) {
        return errorResponse(holdError?.message ?? "Could not create checkout hold", 400);
      }

      hold = holdData as CheckoutHoldRow;
      holdId = hold.id;
    } else {
      holdId = hold.id;
    }

    if (amountTotal <= 0) {
      return errorResponse("Reservation total must be greater than zero", 400);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      expires_at: expiresAtUnix,
      success_url: appendQueryParam(successUrlBase, "session_id", "{CHECKOUT_SESSION_ID}"),
      cancel_url: cancelUrl,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountTotal,
            product_data: {
              name: listing.title,
              description: `${listing.subtitle} reservation`,
            },
          },
        },
      ],
      metadata: {
        hold_id: hold.id,
        listing_id: listing.id,
        renter_id: user.id,
        host_user_id: listing.owner_id,
      },
      payment_intent_data: {
        capture_method: "manual",
        metadata: {
          hold_id: hold.id,
          listing_id: listing.id,
          renter_id: user.id,
          host_user_id: listing.owner_id,
        },
      },
    }, {
      idempotencyKey: `checkout-session:${hold.id}`,
    });

    const { error: updateError } = await service
      .from("checkout_holds")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
      .eq("id", hold.id)
      .eq("status", "OPEN");

    if (updateError) {
      return errorResponse("Could not save checkout hold session", 500);
    }

    return jsonResponse({
      holdId: hold.id,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      amountSubtotal,
      amountPlatformFee,
      amountTotal,
      currency,
    });
  } catch (error) {
    if (holdId) {
      const service = createServiceClient();
      await service
        .from("checkout_holds")
        .update({ status: "CANCELLED" })
        .eq("id", holdId)
        .eq("status", "OPEN");
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
