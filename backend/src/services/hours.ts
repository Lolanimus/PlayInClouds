import type { ActorContext } from "../lib/authorization";
import { assertCanManageListingHours } from "../policy/hours-authorization";
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
import { getListing } from "../clients/listings";

type HoursActor = ActorContext;

export async function listListingWeekSlotsService(args: {
  query: ListListingWeekSlotsQuery;
  accessToken?: string;
}) {
  return listListingWeekSlots(args);
}

export async function listListingMonthSlotsService(args: {
  query: ListListingMonthSlotsQuery;
  accessToken?: string;
}) {
  return listListingMonthSlots(args);
}

async function getManagedHoursListingService(args: {
  actor: HoursActor;
  accessToken: string;
  listingId: string;
}) {
  const listing = await getListing({
    accessToken: args.accessToken,
    listingId: args.listingId,
  });

  assertCanManageListingHours(args.actor, listing);

  return listing;
}

export async function upsertListingWeeklySlotService(args: {
  actor: HoursActor;
  accessToken: string;
  input: UpsertListingWeeklySlotBody;
}) {
  await getManagedHoursListingService({
    actor: args.actor,
    accessToken: args.accessToken,
    listingId: args.input.p_listing_id,
  });

  return upsertListingWeeklySlot(args);
}

export async function setListingWeeklySlotsService(args: {
  actor: HoursActor;
  accessToken: string;
  input: SetListingWeeklySlotsBody;
}) {
  await getManagedHoursListingService({
    actor: args.actor,
    accessToken: args.accessToken,
    listingId: args.input.p_listing_id,
  });

  return setListingWeeklySlots(args);
}
