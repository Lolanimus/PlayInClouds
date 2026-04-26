import type { ListingHourSlot } from "@/types/custom/api.types";

import {
  buildQueryString,
  getAccessToken,
  requestBackend,
} from "./shared";

const getCurrentIsoDate = () => new Date().toISOString().slice(0, 10);

export async function listListingWeekSlots(
  p_listing_id: string,
  p_week: string = getCurrentIsoDate()
): Promise<ListingHourSlot[] | null> {
  const payload = await requestBackend<{ slots: ListingHourSlot[] | null }>({
    path: `/api/hours/week${buildQueryString({ p_listing_id, p_week })}`,
    fallbackMessage: "Failed to list listing week slots",
  });

  return payload.slots;
}

export async function listListingMonthSlots(
  p_listing_id: string,
  p_month: string = getCurrentIsoDate()
): Promise<ListingHourSlot[] | null> {
  const payload = await requestBackend<{ slots: ListingHourSlot[] | null }>({
    path: `/api/hours/month${buildQueryString({ p_listing_id, p_month })}`,
    fallbackMessage: "Failed to list listing month slots",
  });

  return payload.slots;
}

export async function upsertListingWeeklySlot(
  p_listing_id: string,
  p_weekday: number,
  p_hour: number,
  p_price: number
): Promise<ListingHourSlot> {
  const accessToken = await getAccessToken("You must be logged in to update listing weekly slots.");
  const payload = await requestBackend<{ slot: ListingHourSlot }>({
    path: "/api/hours/weekly-slot",
    method: "POST",
    accessToken,
    body: { p_listing_id, p_weekday, p_hour, p_price },
    fallbackMessage: "Failed to upsert listing weekly slot",
  });

  return payload.slot;
}

export async function setListingWeeklySlots(
  p_listing_id: string,
  p_slots: Array<{ weekday: number; hour: number; price: number }>
): Promise<ListingHourSlot[] | null> {
  const accessToken = await getAccessToken("You must be logged in to set listing weekly slots.");
  const payload = await requestBackend<{ slots: ListingHourSlot[] | null }>({
    path: "/api/hours/weekly-slots",
    method: "PUT",
    accessToken,
    body: { p_listing_id, p_slots },
    fallbackMessage: "Failed to set listing weekly slots",
  });

  return payload.slots;
}
