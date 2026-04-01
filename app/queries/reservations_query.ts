import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as reservationsEvents from "../db_rpc/reservations_rpc";

export const reservations = createQueryKeys("reservations", {
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
