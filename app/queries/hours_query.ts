import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as hoursEvents from "~/api/backend/hours";

const getCurrentIsoDate = () => new Date().toISOString().slice(0, 10);

export const hours = createQueryKeys("hours", {
  listWeekSlots: (p?: { p_listing_id?: string; p_week?: string }) => ({
    queryKey: ["list-week-slots", p],
    queryFn: () =>
      hoursEvents.listListingWeekSlots(
        p?.p_listing_id ?? "",
        p?.p_week ?? getCurrentIsoDate()
      ),
  }),

  listMonthSlots: (p?: { p_listing_id?: string; p_month?: string }) => ({
    queryKey: ["list-month-slots", p],
    queryFn: () =>
      hoursEvents.listListingMonthSlots(
        p?.p_listing_id ?? "",
        p?.p_month ?? getCurrentIsoDate()
      ),
  }),
});
