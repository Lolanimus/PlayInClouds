import * as reviewsEvents from "@/db_rpc/reviews_rpc";
import { queries } from "@/queries/queries";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export const useReviews = (
  opts?: { p_listing_id?: string; p_limit?: number; p_offset?: number },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.reviews.list(opts),
    enabled: config?.enabled ?? true,
  });
  return query;
};

export const useGetReview = (id?: string) => {
  const query = useQuery({
    ...queries.reviews.detailById(id),
    enabled: !!id,
  });
  return query;
};

export const useCreateReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      p_listing_id: string;
      p_user_id: string;
      p_rating: number;
      p_text: string;
    }) => {
      console.info("Creating review", payload);
      return await reviewsEvents.createReview(
        payload.p_listing_id,
        payload.p_user_id,
        payload.p_rating,
        payload.p_text
      );
    },
    onSuccess: () => {
      console.info("Review created, invalidating reviews queries");
      queryClient.invalidateQueries({ queryKey: queries.reviews._def });
    },
    onError: (err: any) => {
      console.error("Error creating review", err);
    },
  });
};

export const useUpdateReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { p_id: string; p_rating?: number; p_text?: string }) => {
      console.info("Updating review", args);
      return await reviewsEvents.updateReview(args);
    },
    onSuccess: () => {
      console.info("Review updated, invalidating reviews queries");
      queryClient.invalidateQueries({ queryKey: queries.reviews._def });
    },
    onError: (err: any) => {
      console.error("Error updating review", err);
    },
  });
};

export const useDeleteReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p_id: string) => {
      console.info("Deleting review", p_id);
      return await reviewsEvents.deleteReview(p_id);
    },
    onSuccess: () => {
      console.info("Review deleted, invalidating reviews queries");
      queryClient.invalidateQueries({ queryKey: queries.reviews._def });
    },
    onError: (err: any) => {
      console.error("Error deleting review", err);
    },
  });
};

export default {};
