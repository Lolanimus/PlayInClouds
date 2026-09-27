import * as reservationsEvents from "@/db_rpc/reservations_rpc";
import { queries } from "@/queries/queries";
import { errorStore } from "@/store/error_state";
import type { Reservation } from "@/types/custom/api.types";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function getMutationErrorMessage(fallback: string) {
  return errorStore.getState().error ?? fallback
}

function getMonthKeyFromIsoDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  } catch {
    return "";
  }
}

export const useGetReservation = (
  opts?: { p_reservation_id?: string },
  config?: { enabled?: boolean }
): UseQueryResult<Reservation | null, Error> => {
  const query = useQuery({
    ...queries.reservations.detailById(opts),
    enabled: config?.enabled ?? Boolean(opts?.p_reservation_id),
  });

  return query as UseQueryResult<Reservation | null, Error>;
};

export const useListUserActiveReservations = (
  opts?: { p_renter_id?: string | null },
  config?: { enabled?: boolean }
): UseQueryResult<Reservation[] | null, Error> => {
  const query = useQuery({
    ...queries.reservations.listUserActive(opts),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<Reservation[] | null, Error>;
};

export const useListUserPastReservations = (
  opts?: { p_renter_id?: string | null; p_page?: number; p_page_size?: number },
  config?: { enabled?: boolean }
): UseQueryResult<Reservation[] | null, Error> => {
  const query = useQuery({
    ...queries.reservations.listUserPast(opts),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<Reservation[] | null, Error>;
};

export const useCountUserPastReservations = (
  opts?: { p_renter_id?: string | null },
  config?: { enabled?: boolean }
): UseQueryResult<number | null, Error> => {
  const query = useQuery({
    ...queries.reservations.countUserPast(opts),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<number | null, Error>;
};

export const useListHostMonthlyReservations = (
  opts?: { p_host_id?: string | null; p_month?: number },
  config?: { enabled?: boolean }
): UseQueryResult<Reservation[] | null, Error> => {
  const query = useQuery({
    ...queries.reservations.listHostMonthly(opts),
    enabled: config?.enabled ?? true,
  });

  return query as UseQueryResult<Reservation[] | null, Error>;
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
      const result = await reservationsEvents.createReservation(
        payload.p_listing_id,
        payload.p_start_at,
        payload.p_end_at,
        payload.p_guests ?? 1
      );

      if (!result) {
        throw new Error(getMutationErrorMessage("Failed to create reservation."))
      }

      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def, refetchType: "active" });
      
      const startMonth = getMonthKeyFromIsoDate(variables.p_start_at);
      const endMonth = getMonthKeyFromIsoDate(variables.p_end_at);
      
      if (startMonth) {
        queryClient.invalidateQueries({
          queryKey: ["list-month-slots", { p_listing_id: variables.p_listing_id, p_month: startMonth }],
          refetchType: "active",
        });
      }
      
      if (endMonth && endMonth !== startMonth) {
        queryClient.invalidateQueries({
          queryKey: ["list-month-slots", { p_listing_id: variables.p_listing_id, p_month: endMonth }],
          refetchType: "active",
        });
      }
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
      const result = await reservationsEvents.cancelReservation(payload.p_reservation_id);

      if (!result) {
        throw new Error(getMutationErrorMessage("Failed to cancel reservation."))
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def, refetchType: "active" });
      
      if (result?.listing_id && result?.start_at && result?.end_at) {
        const startMonth = getMonthKeyFromIsoDate(result.start_at);
        const endMonth = getMonthKeyFromIsoDate(result.end_at);
        
        if (startMonth) {
          queryClient.invalidateQueries({
            queryKey: ["list-month-slots", { p_listing_id: result.listing_id, p_month: startMonth }],
            refetchType: "active",
          });
        }
        
        if (endMonth && endMonth !== startMonth) {
          queryClient.invalidateQueries({
            queryKey: ["list-month-slots", { p_listing_id: result.listing_id, p_month: endMonth }],
            refetchType: "active",
          });
        }
      }
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
      const result = await reservationsEvents.confirmReservation(payload.p_reservation_id);

      if (!result) {
        throw new Error(getMutationErrorMessage("Failed to confirm reservation."))
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def, refetchType: "active" });
      
      if (result?.listing_id && result?.start_at && result?.end_at) {
        const startMonth = getMonthKeyFromIsoDate(result.start_at);
        const endMonth = getMonthKeyFromIsoDate(result.end_at);
        
        if (startMonth) {
          queryClient.invalidateQueries({
            queryKey: ["list-month-slots", { p_listing_id: result.listing_id, p_month: startMonth }],
            refetchType: "active",
          });
        }
        
        if (endMonth && endMonth !== startMonth) {
          queryClient.invalidateQueries({
            queryKey: ["list-month-slots", { p_listing_id: result.listing_id, p_month: endMonth }],
            refetchType: "active",
          });
        }
      }
    },
    onError: (err: any) => {
      console.error("Error confirming reservation", err);
    },
  });
};

export const useAcceptLateReservationTerms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { p_reservation_id: string }) => {
      console.info("Accepting late reservation terms", payload);
      const result = await reservationsEvents.acceptLateReservationTerms(payload.p_reservation_id);

      if (!result) {
        throw new Error(getMutationErrorMessage("Failed to continue this late request."))
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queries.reservations._def, refetchType: "active" });
      
      if (result?.listing_id && result?.start_at && result?.end_at) {
        const startMonth = getMonthKeyFromIsoDate(result.start_at);
        const endMonth = getMonthKeyFromIsoDate(result.end_at);
        
        if (startMonth) {
          queryClient.invalidateQueries({
            queryKey: ["list-month-slots", { p_listing_id: result.listing_id, p_month: startMonth }],
            refetchType: "active",
          });
        }
        
        if (endMonth && endMonth !== startMonth) {
          queryClient.invalidateQueries({
            queryKey: ["list-month-slots", { p_listing_id: result.listing_id, p_month: endMonth }],
            refetchType: "active",
          });
        }
      }
    },
    onError: (err: any) => {
      console.error("Error accepting late reservation terms", err);
    },
  });
};

export default {};
