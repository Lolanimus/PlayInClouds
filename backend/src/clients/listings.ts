import type { Listing, ListingModerationQueueItem } from "../../../app/types/custom/api.types";

import { requireClientResult, withClientErrorHandling } from "../lib/client-errors";
import type {
  CreateListingBody,
  ListListingsQuery,
  ModerateListingBody,
  UpdateListingBody,
} from "../schemas/listings";
import {
  approveListingRpc,
  createListingRpc,
  currentUserIsAdminRpc,
  deleteListingRpc,
  getListingRpc,
  listListingsRpc,
  listOwnListingsRpc,
  listPendingListingsRpc,
  rejectListingRpc,
  updateListingRpc,
} from "../middleware/db_rpc/listings_rpc";

export async function createListing(args: {
  accessToken: string;
  input: CreateListingBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await createListingRpc(args);

    return requireClientResult(data, "Listing creation returned no data") as Listing;
  }, "Failed to create listing");
}

export async function getListing(args: {
  listingId: string;
  accessToken?: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await getListingRpc(args);

    if (!data?.id) {
      return requireClientResult(null, "Listing not found", 404) as Listing;
    }

    return data as Listing;
  }, "Failed to get listing");
}

export async function listListings(args: {
  query: ListListingsQuery;
  accessToken?: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await listListingsRpc(args);
    return data as Listing[] | null;
  }, "Failed to list listings");
}

export async function listOwnListings(args: { accessToken: string }) {
  return withClientErrorHandling(async () => {
    const data = await listOwnListingsRpc(args);
    return data as Listing[] | null;
  }, "Failed to list your listings");
}

export async function listPendingListings(args: { accessToken: string }) {
  return withClientErrorHandling(async () => {
    const data = await listPendingListingsRpc(args);
    return data as ListingModerationQueueItem[] | null;
  }, "Failed to list pending listings");
}

export async function currentUserIsAdmin(args: { accessToken: string }) {
  return withClientErrorHandling(async () => {
    const data = await currentUserIsAdminRpc(args);
    return data as boolean | null;
  }, "Failed to get admin status");
}

export async function deleteListing(args: {
  accessToken: string;
  listingId: string;
}) {
  return withClientErrorHandling(async () => {
    return await deleteListingRpc(args);
  }, "Failed to delete listing");
}

export async function approveListing(args: {
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await approveListingRpc(args);

    return requireClientResult(data, "Listing approval returned no data") as Listing;
  }, "Failed to approve listing");
}

export async function rejectListing(args: {
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await rejectListingRpc(args);

    return requireClientResult(data, "Listing rejection returned no data") as Listing;
  }, "Failed to reject listing");
}

export async function updateListing(args: {
  accessToken: string;
  input: UpdateListingBody & { p_id: string };
}) {
  return withClientErrorHandling(async () => {
    const data = await updateListingRpc(args);

    requireClientResult(data, "Listing update returned no data");

    return data;
  }, "Failed to update listing");
}
