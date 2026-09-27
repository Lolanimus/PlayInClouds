import { processRpcRequest } from "~/app/api/supabase/helpers";

const createReservationReview = async (
  p_reservation_id: string,
  p_rating: number,
  p_text: string
) => {
  return await processRpcRequest("create_reservation_review", {
    p_reservation_id,
    p_rating,
    p_text,
  });
};

const updateReservationReview = async (
  p_review_id: string,
  p_rating?: number,
  p_text?: string
) => {
  return await processRpcRequest("update_reservation_review", {
    p_review_id,
    p_rating,
    p_text,
  });
};

const listReviews = async (p_listing_id: string | null = null, p_limit = 6, p_offset = 0) => {
  return await processRpcRequest("list_reviews", {
    p_listing_id,
    p_limit,
    p_offset,
  });
};

const listPendingReservationReviews = async () => {
  return await processRpcRequest("list_pending_reservation_reviews");
};

export { createReservationReview, listPendingReservationReviews, listReviews, updateReservationReview };
