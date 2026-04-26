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
import type {
  CountUserPastReservationsQuery,
  CreateReservationBody,
  ListHostMonthlyReservationsQuery,
  ListUserActiveReservationsQuery,
  ListUserPastReservationsQuery,
} from "../schemas/reservations";

export async function getReservationService(args: {
  accessToken: string;
  reservationId: string;
}) {
  return getReservation(args);
}

export async function cancelReservationService(args: {
  accessToken: string;
  reservationId: string;
}) {
  return cancelReservation(args);
}

export async function confirmReservationService(args: {
  accessToken: string;
  reservationId: string;
}) {
  return confirmReservation(args);
}

export async function createReservationService(args: {
  accessToken: string;
  input: CreateReservationBody;
}) {
  return createReservation(args);
}

export async function listUserActiveReservationsService(args: {
  accessToken: string;
  query: ListUserActiveReservationsQuery;
}) {
  return listUserActiveReservations(args);
}

export async function countUserPastReservationsService(args: {
  accessToken: string;
  query: CountUserPastReservationsQuery;
}) {
  return countUserPastReservations(args);
}

export async function listUserPastReservationsService(args: {
  accessToken: string;
  query: ListUserPastReservationsQuery;
}) {
  return listUserPastReservations(args);
}

export async function listHostMonthlyReservationsService(args: {
  accessToken: string;
  query: ListHostMonthlyReservationsQuery;
}) {
  return listHostMonthlyReservations(args);
}
