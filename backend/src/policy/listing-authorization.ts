import type { Listing } from "../../../app/types/custom/api.types";

import {
	actorHasPermission,
	type ActorContext,
} from "../lib/authorization";
import { throwClientError } from "../lib/client-errors";

type ListingSubject = Pick<Listing, "id" | "owner_id" | "moderation_status">;

function actorOwnsListing(actor: ActorContext, listing: ListingSubject) {
	return listing.owner_id === actor.userId;
}

function actorCanModerateListings(actor: ActorContext) {
	return actorHasPermission(actor, "listings.moderate");
}

function actorCanManageListingContent(actor: ActorContext, listing: ListingSubject) {
	return actorOwnsListing(actor, listing) || actor.isAdmin;
}

export function assertCanCreateListing(actor: ActorContext) {
	if (actor.accountStatus !== "ACTIVE") {
		throwClientError("Active account required to create a listing", 403);
	}
}

export function assertCanViewManagedListing(actor: ActorContext, listing: ListingSubject) {
	if (actorCanModerateListings(actor) || actorOwnsListing(actor, listing)) {
		return;
	}

	throwClientError("You do not have access to this listing", 403);
}

export function assertCanUpdateListing(actor: ActorContext, listing: ListingSubject) {
	if (actorCanManageListingContent(actor, listing)) {
		return;
	}

	throwClientError("Only the listing owner or an admin can update this listing", 403);
}

export function assertCanDeleteListing(actor: ActorContext, listing: ListingSubject) {
	if (actorCanManageListingContent(actor, listing)) {
		return;
	}

	throwClientError("Only the listing owner or an admin can delete this listing", 403);
}

export function assertCanListPendingListings(actor: ActorContext) {
	if (actorCanModerateListings(actor)) {
		return;
	}

	throwClientError("Listing moderation access required", 403);
}

export function assertCanApproveListing(actor: ActorContext) {
	if (actorCanModerateListings(actor)) {
		return;
	}

	throwClientError("Listing moderation access required", 403);
}

export function assertCanRejectListing(actor: ActorContext) {
	if (actorCanModerateListings(actor)) {
		return;
	}

	throwClientError("Listing moderation access required", 403);
}