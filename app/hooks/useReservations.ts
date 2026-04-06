import * as reservationsEvents from "@/db_rpc/reservations_rpc";
import { queries } from "@/queries/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const useGetReservation = (
  opts?: { p_reservation_id?: string },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.reservations.detailById(opts),
    enabled: config?.enabled ?? Boolean(opts?.p_reservation_id),
  });

  return query;
};

export const useListUserActiveReservations = (
  opts?: { p_renter_id?: string | null },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.reservations.listUserActive(opts),
    enabled: config?.enabled ?? true,
  });

  return query;
};

export const useListHostMonthlyReservations = (
  opts?: { p_host_id?: string | null; p_month?: number },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.reservations.listHostMonthly(opts),
    enabled: config?.enabled ?? true,
  });

  return query;
};

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

export const useCancelReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { p_reservation_id: string }) => {
      console.info("Cancelling reservation", payload);
      return await reservationsEvents.cancelReservation(payload.p_reservation_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def });
      queryClient.invalidateQueries({ queryKey: queries.hours._def });
    },
    onError: (err: any) => {
      console.error("Error cancelling reservation", err);
    },
  });
};

export const useConfirmReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { p_reservation_id: string }) => {
      console.info("Confirming reservation", payload);
      return await reservationsEvents.confirmReservation(payload.p_reservation_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def });
      queryClient.invalidateQueries({ queryKey: queries.hours._def });
    },
    onError: (err: any) => {
      console.error("Error confirming reservation", err);
    },
  });
};

export default {};
