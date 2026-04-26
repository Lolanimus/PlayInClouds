import type { Listing, ListingModerationQueueItem } from "../../../../app/types/custom/api.types";

import {
  createAuthedSupabaseClient,
  createPublicSupabaseClient,
} from "../../clients/supabase";
import type {
  CreateListingBody,
  ListListingsQuery,
  ModerateListingBody,
  UpdateListingBody,
} from "../../schemas/listings";

export async function createListingRpc(args: {
  accessToken: string;
  input: CreateListingBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("create_listing", args.input as never);

  if (error) throw error;

  return data as Listing | null;
}

export async function getListingRpc(args: { listingId: string }) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("get_listing", { p_id: args.listingId });

  if (error) throw error;

  return data as Listing | null;
}

export async function listListingsRpc(args: { query: ListListingsQuery }) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("list_listings", {
    p_address: args.query.p_address ?? null,
    p_category: args.query.p_category ?? null,
    p_min_price: args.query.p_min_price ?? null,
    p_max_price: args.query.p_max_price ?? null,
    p_limit: args.query.p_limit ?? 50,
    p_offset: args.query.p_offset ?? 0,
  } as never);

  if (error) throw error;

  return (data ?? null) as Listing[] | null;
}

export async function listOwnListingsRpc(args: { accessToken: string }) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_own_listings");

  if (error) throw error;

  return (data ?? null) as Listing[] | null;
}

export async function listPendingListingsRpc(args: { accessToken: string }) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("list_pending_listings");

  if (error) throw error;

  return (data ?? null) as ListingModerationQueueItem[] | null;
}

export async function currentUserIsAdminRpc(args: { accessToken: string }) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("current_user_is_admin");

  if (error) throw error;

  return (data ?? null) as boolean | null;
}

export async function deleteListingRpc(args: {
  accessToken: string;
  listingId: string;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("delete_listing", { p_id: args.listingId });

  if (error) throw error;

  return data as boolean;
}

export async function approveListingRpc(args: {
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("approve_listing", {
    p_listing_id: args.listingId,
    p_message: args.input.p_message ?? null,
  });

  if (error) throw error;

  return data as Listing | null;
}

export async function rejectListingRpc(args: {
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("reject_listing", {
    p_listing_id: args.listingId,
    p_message: args.input.p_message ?? null,
  });

  if (error) throw error;

  return data as Listing | null;
}

export async function updateListingRpc(args: {
  accessToken: string;
  input: UpdateListingBody & { p_id: string };
}) {
  const supabase = createAuthedSupabaseClient(args.accessToken);
  const { data, error } = await supabase.rpc("update_listing", args.input);

  if (error) {
    throw error;
  }

  return data;
}

