import {
  listListingMonthSlots,
  listListingWeekSlots,
  setListingWeeklySlots,
  upsertListingWeeklySlot,
} from "../clients/hours";
import type {
  ListListingMonthSlotsQuery,
  ListListingWeekSlotsQuery,
  SetListingWeeklySlotsBody,
  UpsertListingWeeklySlotBody,
} from "../schemas/hours";

export async function listListingWeekSlotsService(args: { query: ListListingWeekSlotsQuery }) {
  return listListingWeekSlots(args);
}

export async function listListingMonthSlotsService(args: { query: ListListingMonthSlotsQuery }) {
  return listListingMonthSlots(args);
}

export async function upsertListingWeeklySlotService(args: {
  accessToken: string;
  input: UpsertListingWeeklySlotBody;
}) {
  return upsertListingWeeklySlot(args);
}

export async function setListingWeeklySlotsService(args: {
  accessToken: string;
  input: SetListingWeeklySlotsBody;
}) {
  return setListingWeeklySlots(args);
}
