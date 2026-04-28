import type { Listing, Reservation } from "../../../app/types/custom/api.types";

import type { ActorContext } from "../lib/authorization";
import { throwClientError } from "../lib/client-errors";

type ReservationSubject = Pick<
  Reservation,
  "id" | "listing_id" | "renter_id" | "status" | "start_at" | "end_at"
>;

type ReservationListingSubject = Pick<Listing, "id" | "owner_id">;

function actorIsReservationRenter(actor: ActorContext, reservation: ReservationSubject) {
  return reservation.renter_id === actor.userId;
}

function actorOwnsReservationListing(actor: ActorContext, listing: ReservationListingSubject) {
  return listing.owner_id === actor.userId;
}

function actorCanAccessReservation(
  actor: ActorContext,
  reservation: ReservationSubject,
  listing: ReservationListingSubject
) {
  return actor.isAdmin || actorIsReservationRenter(actor, reservation) || actorOwnsReservationListing(actor, listing);
}

export function assertCanListUserReservations(actor: ActorContext, renterId?: string) {
  if (!renterId || renterId === actor.userId || actor.isAdmin) {
    return;
  }

  throwClientError("You can only view your own reservations", 403);
}

export function assertCanListHostReservations(actor: ActorContext, hostId?: string) {
  if (!hostId || hostId === actor.userId || actor.isAdmin) {
    return;
  }

  throwClientError("You can only view reservations for your own listings", 403);
}

export function assertCanViewReservation(
  actor: ActorContext,
  reservation: ReservationSubject,
  listing: ReservationListingSubject
) {
  if (actorCanAccessReservation(actor, reservation, listing)) {
    return;
  }

  throwClientError("You do not have access to this reservation", 403);
}

export function assertCanCreateReservation(actor: ActorContext, listing: ReservationListingSubject) {
  if (listing.owner_id === actor.userId) {
    throwClientError("You cannot reserve your own listing", 403);
  }
}

export function assertCanCancelReservation(
  actor: ActorContext,
  reservation: ReservationSubject,
  listing: ReservationListingSubject
) {
  if (actorCanAccessReservation(actor, reservation, listing)) {
    return;
  }

  throwClientError("Only the renter or listing owner can cancel this reservation", 403);
}

export function assertCanConfirmReservation(actor: ActorContext, listing: ReservationListingSubject) {
  if (actor.isAdmin || actorOwnsReservationListing(actor, listing)) {
    return;
  }

  throwClientError("Only the listing owner can confirm this reservation", 403);
}