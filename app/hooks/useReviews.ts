import * as reviewsEvents from "~/api/backend/reviews";
import { queries } from "@/queries/queries";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PendingReservationReview, ReservationReview } from "@/types/custom/api.types";
import { useUser } from "@/store/user_state";

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

export const usePendingReservationReviews = (config?: { enabled?: boolean }) => {
  const user = useUser();

  const query = useQuery({
    ...queries.reviews.pendingReservation(),
    enabled: config?.enabled ?? true,
    select: (rows: PendingReservationReview[] | null | undefined) =>
      (rows ?? []).filter(
        (review) => Boolean(review.reviewee_user_id) && review.reviewee_user_id !== user?.id
      ),
  });

  return query;
};

export const useCreateReservationReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      p_reservation_id: string;
      p_rating: number;
      p_text: string;
    }) => {
      return await reviewsEvents.createReservationReview(
        payload.p_reservation_id,
        payload.p_rating,
        payload.p_text
      );
    },
    onSuccess: (result, variables) => {
      const createdReview = result as ReservationReview | null;

      queryClient.setQueryData(
        queries.reviews.pendingReservation().queryKey,
        (current: PendingReservationReview[] | null | undefined) =>
          (current ?? []).filter(
            (review) => {
              if (review.reservation_id === variables.p_reservation_id) {
                return false;
              }

              if (
                createdReview?.reviewer_role === "HOST_TO_BOOKER"
                && review.reviewer_role === "HOST_TO_BOOKER"
                && review.reviewee_user_id === createdReview.reviewee_user_id
              ) {
                return false;
              }

              return true;
            }
          )
      );

      queryClient.invalidateQueries({ queryKey: queries.reviews.pendingReservation().queryKey });
      queryClient.invalidateQueries({ queryKey: queries.reviews._def });
      queryClient.invalidateQueries({ queryKey: queries.reservations._def });
    },
    onError: (err: any) => {
      console.error("Error creating reservation review", err);
    },
  });
};

export const useUpdateReservationReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      p_review_id: string;
      p_rating?: number;
      p_text?: string;
    }) => {
      return await reviewsEvents.updateReservationReview(
        payload.p_review_id,
        payload.p_rating,
        payload.p_text
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.reviews._def });
      queryClient.invalidateQueries({ queryKey: queries.reservations._def });
    },
    onError: (err: any) => {
      console.error("Error updating reservation review", err);
    },
  });
};

export default {};
