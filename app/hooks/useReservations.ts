import * as reservationsEvents from "@/db_rpc/reservations_rpc";
import { queries } from "@/queries/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const useCreateReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      p_listing_id: string;
      p_start_at: string;
      p_end_at: string;
      p_guests?: number;
    }) => {
      console.info("Creating reservation", payload);
      return await reservationsEvents.createReservation(
        payload.p_listing_id,
        payload.p_start_at,
        payload.p_end_at,
        payload.p_guests ?? 1
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def });
      queryClient.invalidateQueries({ queryKey: queries.hours._def });
    },
    onError: (err: any) => {
      console.error("Error creating reservation", err);
    },
  });
};

export default {};
