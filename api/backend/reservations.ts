import type { Reservation } from "@/types/custom/api.types";

import {
  buildQueryString,
  getAccessToken,
  requestBackend,
} from "./shared";

export async function getReservation(p_reservation_id: string): Promise<Reservation> {
  const accessToken = await getAccessToken("You must be logged in to view a reservation.");
  const payload = await requestBackend<{ reservation: Reservation }>({
    path: `/api/reservations/${p_reservation_id}`,
    accessToken,
    fallbackMessage: "Failed to get reservation",
  });

  return payload.reservation;
}

export async function cancelReservation(p_reservation_id: string): Promise<Reservation> {
  const accessToken = await getAccessToken("You must be logged in to cancel a reservation.");
  const payload = await requestBackend<{ reservation: Reservation }>({
    path: `/api/reservations/${p_reservation_id}/cancel`,
    method: "POST",
    accessToken,
    fallbackMessage: "Failed to cancel reservation",
  });

  return payload.reservation;
}

export async function confirmReservation(p_reservation_id: string): Promise<Reservation> {
  const accessToken = await getAccessToken("You must be logged in to confirm a reservation.");
  const payload = await requestBackend<{ reservation: Reservation }>({
    path: `/api/reservations/${p_reservation_id}/confirm`,
    method: "POST",
    accessToken,
    fallbackMessage: "Failed to confirm reservation",
  });

  return payload.reservation;
}

export async function createReservation(
  p_listing_id: string,
  p_start_at: string,
  p_end_at: string,
  p_guests = 1
): Promise<Reservation> {
  const accessToken = await getAccessToken("You must be logged in to create a reservation.");
  const payload = await requestBackend<{ reservation: Reservation }>({
    path: "/api/reservations",
    method: "POST",
    accessToken,
    body: { p_listing_id, p_start_at, p_end_at, p_guests },
    fallbackMessage: "Failed to create reservation",
  });

  return payload.reservation;
}

export async function listUserActiveReservations(
  p_renter_id?: string | null
): Promise<Reservation[] | null> {
  const accessToken = await getAccessToken("You must be logged in to view active reservations.");
  const payload = await requestBackend<{ reservations: Reservation[] | null }>({
    path: `/api/reservations/active${buildQueryString({ p_renter_id: p_renter_id ?? undefined })}`,
    accessToken,
    fallbackMessage: "Failed to list active reservations",
  });

  return payload.reservations;
}

export async function countUserPastReservations(
  p_renter_id?: string | null
): Promise<number | null> {
  const accessToken = await getAccessToken("You must be logged in to count past reservations.");
  const payload = await requestBackend<{ count: number | null }>({
    path: `/api/reservations/past/count${buildQueryString({ p_renter_id: p_renter_id ?? undefined })}`,
    accessToken,
    fallbackMessage: "Failed to count past reservations",
  });

  return payload.count;
}

export async function listUserPastReservations(
  p_renter_id?: string | null,
  p_page = 1,
  p_page_size = 6
): Promise<Reservation[] | null> {
  const accessToken = await getAccessToken("You must be logged in to view past reservations.");
  const payload = await requestBackend<{ reservations: Reservation[] | null }>({
    path: `/api/reservations/past${buildQueryString({
      p_renter_id: p_renter_id ?? undefined,
      p_page,
      p_page_size,
    })}`,
    accessToken,
    fallbackMessage: "Failed to list past reservations",
  });

  return payload.reservations;
}

export async function listHostMonthlyReservations(
  p_host_id?: string | null,
  p_month?: number
): Promise<Reservation[] | null> {
  const accessToken = await getAccessToken("You must be logged in to view host reservations.");
  const payload = await requestBackend<{ reservations: Reservation[] | null }>({
    path: `/api/reservations/host/monthly${buildQueryString({
      p_host_id: p_host_id ?? undefined,
      p_month,
    })}`,
    accessToken,
    fallbackMessage: "Failed to list host monthly reservations",
  });

  return payload.reservations;
}
