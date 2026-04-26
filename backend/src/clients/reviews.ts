import type { PendingReservationReview, ReservationReview, Review } from "../../../app/types/custom/api.types";

import { requireClientResult, withClientErrorHandling } from "../lib/client-errors";
import {
  createReservationReviewRpc,
  listPendingReservationReviewsRpc,
  listReviewsRpc,
  updateReservationReviewRpc,
} from "../middleware/db_rpc/reviews_rpc";
import type {
  CreateReservationReviewBody,
  ListReviewsQuery,
  UpdateReservationReviewBody,
} from "../schemas/reviews";

export async function createReservationReview(args: {
  accessToken: string;
  input: CreateReservationReviewBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await createReservationReviewRpc(args);

    return requireClientResult(data, "Reservation review creation returned no data") as ReservationReview;
  }, "Failed to create reservation review");
}

export async function updateReservationReview(args: {
  accessToken: string;
  reviewId: string;
  input: UpdateReservationReviewBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await updateReservationReviewRpc(args);

    return requireClientResult(data, "Reservation review update returned no data") as ReservationReview;
  }, "Failed to update reservation review");
}

export async function listReviews(args: { query: ListReviewsQuery }) {
  return withClientErrorHandling(async () => {
    const data = await listReviewsRpc(args);
    return data as Review[] | null;
  }, "Failed to list reviews");
}

export async function listPendingReservationReviews(args: { accessToken: string }) {
  return withClientErrorHandling(async () => {
    const data = await listPendingReservationReviewsRpc(args);
    return data as PendingReservationReview[] | null;
  }, "Failed to list pending reservation reviews");
}
