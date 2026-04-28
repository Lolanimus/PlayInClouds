import type { ListingHourSlot } from "../../../app/types/custom/api.types";

import { requireClientResult, withClientErrorHandling } from "../lib/client-errors";
import {
  listListingMonthSlotsRpc,
  listListingWeekSlotsRpc,
  setListingWeeklySlotsRpc,
  upsertListingWeeklySlotRpc,
} from "../middleware/db_rpc/hours_rpc";
import type {
  ListListingMonthSlotsQuery,
  ListListingWeekSlotsQuery,
  SetListingWeeklySlotsBody,
  UpsertListingWeeklySlotBody,
} from "../schemas/hours";

export async function listListingWeekSlots(args: {
  query: ListListingWeekSlotsQuery;
  accessToken?: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await listListingWeekSlotsRpc(args);
    return data as ListingHourSlot[] | null;
  }, "Failed to list listing week slots");
}

export async function listListingMonthSlots(args: {
  query: ListListingMonthSlotsQuery;
  accessToken?: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await listListingMonthSlotsRpc(args);
    return data as ListingHourSlot[] | null;
  }, "Failed to list listing month slots");
}

export async function upsertListingWeeklySlot(args: {
  accessToken: string;
  input: UpsertListingWeeklySlotBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await upsertListingWeeklySlotRpc(args);

    return requireClientResult(data, "Listing weekly slot upsert returned no data") as ListingHourSlot;
  }, "Failed to upsert listing weekly slot");
}

export async function setListingWeeklySlots(args: {
  accessToken: string;
  input: SetListingWeeklySlotsBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await setListingWeeklySlotsRpc(args);
    return data as ListingHourSlot[] | null;
  }, "Failed to set listing weekly slots");
}
