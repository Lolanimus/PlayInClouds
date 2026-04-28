import {
  createReservationReview,
  listPendingReservationReviews,
  listReviews,
  updateReservationReview,
} from "../clients/reviews";
import type {
  CreateReservationReviewBody,
  ListReviewsQuery,
  UpdateReservationReviewBody,
} from "../schemas/reviews";

export async function createReservationReviewService(args: {
  accessToken: string;
  input: CreateReservationReviewBody;
}) {
  return createReservationReview(args);
}

export async function updateReservationReviewService(args: {
  accessToken: string;
  reviewId: string;
  input: UpdateReservationReviewBody;
}) {
  return updateReservationReview(args);
}

export async function listReviewsService(args: {
  query: ListReviewsQuery;
  accessToken?: string;
}) {
  return listReviews(args);
}

export async function listPendingReservationReviewsService(args: {
  accessToken: string;
}) {
  return listPendingReservationReviews(args);
}
