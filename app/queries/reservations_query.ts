import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as reservationsEvents from "../db_rpc/reservations_rpc";

export const reservations = createQueryKeys("reservations", {
  detailById: (p?: { p_reservation_id?: string }) => ({
    queryKey: ["detail", p],
    queryFn: () => reservationsEvents.getReservation(p?.p_reservation_id ?? ""),
  }),

  listUserActive: (p?: { p_renter_id?: string | null }) => ({
    queryKey: ["list-user-active", p],
    queryFn: () => reservationsEvents.listUserActiveReservations(p?.p_renter_id ?? null),
  }),

  countUserPast: (p?: { p_renter_id?: string | null }) => ({
    queryKey: ["count-user-past", p],
    queryFn: () => reservationsEvents.countUserPastReservations(p?.p_renter_id ?? null),
  }),

  listUserPast: (p?: { p_renter_id?: string | null; p_page?: number; p_page_size?: number }) => ({
    queryKey: ["list-user-past", p],
    queryFn: () =>
      reservationsEvents.listUserPastReservations(
        p?.p_renter_id ?? null,
        p?.p_page,
        p?.p_page_size
      ),
  }),

  listHostMonthly: (p?: { p_host_id?: string | null; p_month?: number }) => ({
    queryKey: ["list-host-monthly", p],
    queryFn: () =>
      reservationsEvents.listHostMonthlyReservations(
        p?.p_host_id ?? null,
        p?.p_month
      ),
  }),

  create: (p: {
    p_listing_id: string;
    p_start_at: string;
    p_end_at: string;
    p_guests?: number;
  }) => ({
    queryKey: ["create", p],
    queryFn: () =>
      reservationsEvents.createReservation(
        p.p_listing_id,
        p.p_start_at,
        p.p_end_at,
        p.p_guests
      ),
  }),
});
