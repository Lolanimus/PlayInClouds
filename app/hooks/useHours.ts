import * as hoursEvents from "~/api/backend/hours";
import { queries } from "@/queries/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const useListingWeekSlots = (
  opts?: { p_listing_id?: string; p_week?: string },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.hours.listWeekSlots(opts),
    enabled: config?.enabled ?? Boolean(opts?.p_listing_id),
  });

  return query;
};

export const useListingMonthSlots = (
  opts?: { p_listing_id?: string; p_month?: string },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.hours.listMonthSlots(opts),
    enabled: config?.enabled ?? Boolean(opts?.p_listing_id),
  });

  return query;
};

export const useUpsertListingWeeklySlot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      p_listing_id: string;
      p_weekday: number;
      p_hour: number;
      p_price: number;
    }) => {
      console.info("Upserting listing weekly slot", args);
      return await hoursEvents.upsertListingWeeklySlot(
        args.p_listing_id,
        args.p_weekday,
        args.p_hour,
        args.p_price
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.hours._def });
    },
    onError: (err: any) => {
      console.error("Error upserting listing weekly slot", err);
    },
  });
};

export const useSetListingWeeklySlots = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      p_listing_id: string;
      p_slots: Array<{ weekday: number; hour: number; price: number }>;
    }) => {
      console.info("Setting listing weekly slots", args);
      return await hoursEvents.setListingWeeklySlots(args.p_listing_id, args.p_slots);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.hours._def });
    },
    onError: (err: any) => {
      console.error("Error setting listing weekly slots", err);
    },
  });
};

export default {};
