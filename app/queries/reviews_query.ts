import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as reviewsEvents from "~/api/backend/reviews";

export const reviews = createQueryKeys("reviews", {
  pendingReservation: () => ({
    queryKey: ["pending-reservation"],
    queryFn: () => reviewsEvents.listPendingReservationReviews(),
  }),

  // List reviews for a listing (or all)
  list: (
    p?: { p_listing_id?: string; p_limit?: number; p_offset?: number }
  ) => ({
    queryKey: ["list", p],
    queryFn: () =>
      reviewsEvents.listReviews(
        p?.p_listing_id,
        p?.p_limit,
        p?.p_offset
      ),
  }),
});
