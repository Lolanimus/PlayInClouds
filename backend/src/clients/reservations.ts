import type { Reservation } from "../../../app/types/custom/api.types";

import { requireClientResult, withClientErrorHandling } from "../lib/client-errors";
import {
  cancelReservationRpc,
  confirmReservationRpc,
  countUserPastReservationsRpc,
  createReservationRpc,
  getReservationRpc,
  listHostMonthlyReservationsRpc,
  listUserActiveReservationsRpc,
  listUserPastReservationsRpc,
} from "../middleware/db_rpc/reservations_rpc";
import type {
  CountUserPastReservationsQuery,
  CreateReservationBody,
  ListHostMonthlyReservationsQuery,
  ListUserActiveReservationsQuery,
  ListUserPastReservationsQuery,
} from "../schemas/reservations";

export async function getReservation(args: {
  accessToken: string;
  reservationId: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await getReservationRpc(args);

    return requireClientResult(data, "Reservation not found", 404) as Reservation;
  }, "Failed to get reservation");
}

export async function cancelReservation(args: {
  accessToken: string;
  reservationId: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await cancelReservationRpc(args);

    return requireClientResult(data, "Reservation cancellation returned no data") as Reservation;
  }, "Failed to cancel reservation");
}

export async function confirmReservation(args: {
  accessToken: string;
  reservationId: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await confirmReservationRpc(args);

    return requireClientResult(data, "Reservation confirmation returned no data") as Reservation;
  }, "Failed to confirm reservation");
}

export async function createReservation(args: {
  accessToken: string;
  input: CreateReservationBody;
}) {
  return withClientErrorHandling(async () => {
    const data = await createReservationRpc(args);

    return requireClientResult(data, "Reservation creation returned no data") as Reservation;
  }, "Failed to create reservation");
}

export async function listUserActiveReservations(args: {
  accessToken: string;
  query: ListUserActiveReservationsQuery;
}) {
  return withClientErrorHandling(async () => {
    const data = await listUserActiveReservationsRpc(args);
    return data as Reservation[] | null;
  }, "Failed to list active reservations");
}

export async function countUserPastReservations(args: {
  accessToken: string;
  query: CountUserPastReservationsQuery;
}) {
  return withClientErrorHandling(async () => {
    return await countUserPastReservationsRpc(args);
  }, "Failed to count past reservations");
}

export async function listUserPastReservations(args: {
  accessToken: string;
  query: ListUserPastReservationsQuery;
}) {
  return withClientErrorHandling(async () => {
    const data = await listUserPastReservationsRpc(args);
    return data as Reservation[] | null;
  }, "Failed to list past reservations");
}

export async function listHostMonthlyReservations(args: {
  accessToken: string;
  query: ListHostMonthlyReservationsQuery;
}) {
  return withClientErrorHandling(async () => {
    const data = await listHostMonthlyReservationsRpc(args);
    return data as Reservation[] | null;
  }, "Failed to list host monthly reservations");
}
