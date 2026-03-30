import { processRpcRequest } from "@/api/helpers";

const createReview = async (
  p_listing_id: string,
  p_user_id: string,
  p_rating: number,
  p_text: string
) => {
  return await processRpcRequest("create_review", {
    p_listing_id,
    p_user_id,
    p_rating,
    p_text,
  });
};

const getReview = async (p_id: string) => {
  return await processRpcRequest("get_review", { p_id });
};

const listReviews = async (p_listing_id: string | null = null, p_limit = 50, p_offset = 0) => {
  return await processRpcRequest("list_reviews", { p_listing_id, p_limit, p_offset });
};

const updateReview = async (args: { p_id: string; p_rating?: number; p_text?: string }) => {
  return await processRpcRequest("update_review", args);
};

const deleteReview = async (p_id: string) => {
  return await processRpcRequest("delete_review", { p_id });
};

export { createReview, getReview, listReviews, updateReview, deleteReview };
