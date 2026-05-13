import type { ActorContext } from "../lib/authorization";
import type {
	CreateListingBody,
	ListListingsQuery,
	ModerateListingBody,
	UpdateListingBody,
} from "../schemas/listings";
import {
  assertCanApproveListing,
  assertCanCreateListing,
  assertCanDeleteListing,
  assertCanListPendingListings,
  assertCanRejectListing,
  assertCanUpdateListing,
  assertCanViewManagedListing,
} from "../policy/listing-authorization";
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

type ListingActor = ActorContext;

export async function createListingService(args: {
	actor: ListingActor;
  accessToken: string;
  input: CreateListingBody;
}) {
	assertCanCreateListing(args.actor);
  return createListing(args);
}

export async function getListingService(args: {
  listingId: string;
  accessToken?: string;
}) {
  return getListing(args);
}

export async function listListingsService(args: {
  query: ListListingsQuery;
  accessToken?: string;
}) {
  return listListings(args);
}

export async function listOwnListingsService(args: { accessToken: string }) {
  return listOwnListings(args);
}

export async function getManagedListingService(args: {
	actor: ListingActor;
  accessToken: string;
  listingId: string;
}) {
  const listing = await getListing({
    accessToken: args.accessToken,
    listingId: args.listingId,
  });

  assertCanViewManagedListing(args.actor, listing);

  return listing;
}

export async function listPendingListingsService(args: {
	actor: ListingActor;
  accessToken: string;
}) {
	assertCanListPendingListings(args.actor);
  return listPendingListings(args);
}

export async function currentUserIsAdminService(args: { accessToken: string }) {
  return currentUserIsAdmin(args);
}

export async function deleteListingService(args: {
  actor: ListingActor;
  accessToken: string;
  listingId: string;
}) {
  const listing = await getManagedListingService(args);
  assertCanDeleteListing(args.actor, listing);
  return deleteListing(args);
}

export async function approveListingService(args: {
  actor: ListingActor;
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  await getManagedListingService(args);
  assertCanApproveListing(args.actor);
  return approveListing(args);
}

export async function rejectListingService(args: {
  actor: ListingActor;
  accessToken: string;
  listingId: string;
  input: ModerateListingBody;
}) {
  await getManagedListingService(args);
  assertCanRejectListing(args.actor);
  return rejectListing(args);
}

export async function updateListingService(args: {
  actor: ListingActor;
  accessToken: string;
  listingId: string;
  input: UpdateListingBody;
}) {
  const listing = await getManagedListingService(args);
  assertCanUpdateListing(args.actor, listing);
  return updateListing({
    accessToken: args.accessToken,
    input: {
      p_id: args.listingId,
      ...args.input,
    },
  });
}
