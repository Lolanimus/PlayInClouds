import type {
  CreateListingBody,
  ListListingsQuery,
  ModerateListingBody,
  UpdateListingBody,
} from "../schemas/listings";
import {
  approveListing,
  createListing,
  currentUserIsAdmin,
  deleteListing,
  getListing,
  listListings,
  listOwnListings,
  listPendingListings,
  rejectListing,
  updateListing,
} from "../clients/listings";

export async function createListingService(args: {
  accessToken: string;
  input: CreateListingBody;
}) {
  return createListing(args);
}

export async function getListingService(args: { listingId: string }) {
  return getListing(args);
}

export async function listListingsService(args: { query: ListListingsQuery }) {
  return listListings(args);
}

export async function listOwnListingsService(args: { accessToken: string }) {
  return listOwnListings(args);
}

export async function listPendingListingsService(args: { accessToken: string }) {
  return listPendingListings(args);
}

export async function currentUserIsAdminService(args: { accessToken: string }) {
  return currentUserIsAdmin(args);
}

export async function deleteListingService(args: {
  accessToken: string;
  listingId: string;
}) {
  return deleteListing(args);
}

export async function approveListingService(args: {
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  return approveListing(args);
}

export async function rejectListingService(args: {
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  return rejectListing(args);
}

export async function updateListingService(args: {
  accessToken: string;
  listingId: string;
  input: UpdateListingBody;
}) {
  return updateListing({
    accessToken: args.accessToken,
    input: {
      p_id: args.listingId,
      ...args.input,
    },
  });
}
