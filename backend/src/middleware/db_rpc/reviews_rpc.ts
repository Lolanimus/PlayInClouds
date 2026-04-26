import type { PendingReservationReview, ReservationReview, Review } from "../../../../app/types/custom/api.types";

import {
  createAuthedSupabaseClient,
  createPublicSupabaseClient,
} from "../../clients/supabase";
import type {
  CreateReservationReviewBody,
  ListReviewsQuery,
  UpdateReservationReviewBody,
} from "../../schemas/reviews";

export async function createReservationReviewRpc(args: {
  accessToken: string;
  input: CreateReservationReviewBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("create_reservation_review", args.input as never);

  if (error) throw error;

  return data as ReservationReview | null;
}

export async function updateReservationReviewRpc(args: {
  accessToken: string;
  reviewId: string;
  input: UpdateReservationReviewBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("update_reservation_review", {
    p_review_id: args.reviewId,
    ...args.input,
  } as never);

  if (error) throw error;

  return data as ReservationReview | null;
}

export async function listReviewsRpc(args: { query: ListReviewsQuery }) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("list_reviews", {
    p_listing_id: args.query.p_listing_id ?? null,
    p_limit: args.query.p_limit ?? 6,
    p_offset: args.query.p_offset ?? 0,
  } as never);

  if (error) throw error;

  return (data ?? null) as Review[] | null;
}

export async function listPendingReservationReviewsRpc(args: { accessToken: string }) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_pending_reservation_reviews");

  if (error) throw error;

  return (data ?? null) as PendingReservationReview[] | null;
}
