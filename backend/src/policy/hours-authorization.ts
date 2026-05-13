import type { Listing } from "../../../app/types/custom/api.types";

import type { ActorContext } from "../lib/authorization";
import { throwClientError } from "../lib/client-errors";

type ListingSubject = Pick<Listing, "id" | "owner_id">;

function actorOwnsListing(actor: ActorContext, listing: ListingSubject) {
	return listing.owner_id === actor.userId;
}

function actorCanManageListingHours(actor: ActorContext, listing: ListingSubject) {
	return actorOwnsListing(actor, listing) || actor.isAdmin;
}

export function assertCanManageListingHours(actor: ActorContext, listing: ListingSubject) {
	if (actorCanManageListingHours(actor, listing)) {
		return;
	}

	throwClientError("Only the listing owner or an admin can update listing hours", 403);
}