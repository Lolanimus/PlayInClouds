import type { ActorContext } from "../lib/authorization";
import { getListing } from "../clients/listings";
import {
  cancelReservation,
  confirmReservation,
  countUserPastReservations,
  createReservation,
  getReservation,
  listHostMonthlyReservations,
  listUserActiveReservations,
  listUserPastReservations,
} from "../clients/reservations";
import {
  assertCanCancelReservation,
  assertCanConfirmReservation,
  assertCanCreateReservation,
  assertCanListHostReservations,
  assertCanListUserReservations,
  assertCanViewReservation,
} from "../policy/reservation-authorization";
import type {
  CountUserPastReservationsQuery,
  CreateReservationBody,
  ListHostMonthlyReservationsQuery,
  ListUserActiveReservationsQuery,
  ListUserPastReservationsQuery,
} from "../schemas/reservations";

type ReservationActor = ActorContext;

async function getManagedReservationService(args: {
  actor: ReservationActor;
  accessToken: string;
  reservationId: string;
}) {
  const reservation = await getReservation({
    accessToken: args.accessToken,
    reservationId: args.reservationId,
  });
  const listing = await getListing({
    accessToken: args.accessToken,
    listingId: reservation.listing_id,
  });

  return { reservation, listing };
}

export async function getReservationService(args: {
  actor: ReservationActor;
  accessToken: string;
  reservationId: string;
}) {
  const { reservation, listing } = await getManagedReservationService(args);
  assertCanViewReservation(args.actor, reservation, listing);

  return reservation;
}

export async function cancelReservationService(args: {
  actor: ReservationActor;
  accessToken: string;
  reservationId: string;
}) {
  const { reservation, listing } = await getManagedReservationService(args);
  assertCanCancelReservation(args.actor, reservation, listing);

  return cancelReservation(args);
}

export async function confirmReservationService(args: {
  actor: ReservationActor;
  accessToken: string;
  reservationId: string;
}) {
  const { listing } = await getManagedReservationService(args);
  assertCanConfirmReservation(args.actor, listing);

  return confirmReservation(args);
}

export async function createReservationService(args: {
  actor: ReservationActor;
  accessToken: string;
  input: CreateReservationBody;
}) {
  const listing = await getListing({
    accessToken: args.accessToken,
    listingId: args.input.p_listing_id,
  });

  assertCanCreateReservation(args.actor, listing);

  return createReservation(args);
}

export async function listUserActiveReservationsService(args: {
  actor: ReservationActor;
  accessToken: string;
  query: ListUserActiveReservationsQuery;
}) {
  assertCanListUserReservations(args.actor, args.query.p_renter_id);
  return listUserActiveReservations(args);
}

export async function countUserPastReservationsService(args: {
  actor: ReservationActor;
  accessToken: string;
  query: CountUserPastReservationsQuery;
}) {
  assertCanListUserReservations(args.actor, args.query.p_renter_id);
  return countUserPastReservations(args);
}

export async function listUserPastReservationsService(args: {
  actor: ReservationActor;
  accessToken: string;
  query: ListUserPastReservationsQuery;
}) {
  assertCanListUserReservations(args.actor, args.query.p_renter_id);
  return listUserPastReservations(args);
}

export async function listHostMonthlyReservationsService(args: {
  actor: ReservationActor;
  accessToken: string;
  query: ListHostMonthlyReservationsQuery;
}) {
  assertCanListHostReservations(args.actor, args.query.p_host_id);
  return listHostMonthlyReservations(args);
}
