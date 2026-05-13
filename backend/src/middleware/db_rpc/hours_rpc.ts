import type { ListingHourSlot } from "../../../../app/types/custom/api.types";

import {
  createAuthedSupabaseClient,
  createPublicSupabaseClient,
} from "../../clients/supabase";
import type {
  ListListingMonthSlotsQuery,
  ListListingWeekSlotsQuery,
  SetListingWeeklySlotsBody,
  UpsertListingWeeklySlotBody,
} from "../../schemas/hours";

const getCurrentIsoDate = () => new Date().toISOString().slice(0, 10);

function getHoursReadSupabaseClient(accessToken?: string) {
  return accessToken ? createAuthedSupabaseClient(accessToken) : createPublicSupabaseClient();
}

export async function listListingWeekSlotsRpc(args: {
  query: ListListingWeekSlotsQuery;
  accessToken?: string;
}) {
  const supabase = getHoursReadSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_listing_week_slots", {
    p_listing_id: args.query.p_listing_id,
    p_week: args.query.p_week ?? getCurrentIsoDate(),
  });

  if (error) throw error;

  return (data ?? null) as ListingHourSlot[] | null;
}

export async function listListingMonthSlotsRpc(args: {
  query: ListListingMonthSlotsQuery;
  accessToken?: string;
}) {
  const supabase = getHoursReadSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_listing_month_slots", {
    p_listing_id: args.query.p_listing_id,
    p_month: args.query.p_month ?? getCurrentIsoDate(),
  });

  if (error) throw error;

  return (data ?? null) as ListingHourSlot[] | null;
}

export async function upsertListingWeeklySlotRpc(args: {
  accessToken: string;
  input: UpsertListingWeeklySlotBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("upsert_listing_weekly_slot", args.input);

  if (error) throw error;

  return data as ListingHourSlot | null;
}

export async function setListingWeeklySlotsRpc(args: {
  accessToken: string;
  input: SetListingWeeklySlotsBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("set_listing_weekly_slots", {
    p_listing_id: args.input.p_listing_id,
    p_slots: args.input.p_slots as never,
  } as never);

  if (error) throw error;

  return (data ?? null) as ListingHourSlot[] | null;
}
