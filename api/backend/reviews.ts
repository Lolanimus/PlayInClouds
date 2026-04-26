import type { PendingReservationReview, ReservationReview, Review } from "@/types/custom/api.types";

import {
  buildQueryString,
  getAccessToken,
  requestBackend,
} from "./shared";

export async function createReservationReview(
  p_reservation_id: string,
  p_rating: number,
  p_text: string
): Promise<ReservationReview> {
  const accessToken = await getAccessToken("You must be logged in to create a reservation review.");
  const payload = await requestBackend<{ review: ReservationReview }>({
    path: "/api/reviews/reservation",
    method: "POST",
    accessToken,
    body: { p_reservation_id, p_rating, p_text },
    fallbackMessage: "Failed to create reservation review",
  });

  return payload.review;
}

export async function updateReservationReview(
  p_review_id: string,
  p_rating?: number,
  p_text?: string
): Promise<ReservationReview> {
  const accessToken = await getAccessToken("You must be logged in to update a reservation review.");
  const payload = await requestBackend<{ review: ReservationReview }>({
    path: `/api/reviews/${p_review_id}`,
    method: "PATCH",
    accessToken,
    body: { p_rating, p_text },
    fallbackMessage: "Failed to update reservation review",
  });

  return payload.review;
}

export async function listReviews(
  p_listing_id: string | null = null,
  p_limit = 6,
  p_offset = 0
): Promise<Review[] | null> {
  const payload = await requestBackend<{ reviews: Review[] | null }>({
    path: `/api/reviews${buildQueryString({ p_listing_id, p_limit, p_offset })}`,
    fallbackMessage: "Failed to list reviews",
  });

  return payload.reviews;
}

export async function listPendingReservationReviews(): Promise<PendingReservationReview[] | null> {
  const accessToken = await getAccessToken("You must be logged in to view pending reservation reviews.");
  const payload = await requestBackend<{ reviews: PendingReservationReview[] | null }>({
    path: "/api/reviews/pending-reservation",
    accessToken,
    fallbackMessage: "Failed to list pending reservation reviews",
  });

  return payload.reviews;
}
