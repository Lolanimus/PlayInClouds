import { z } from "zod";
import type { Function } from "../../../app/types/custom/rpc.types";

export type CreateReservationBody = Function<"create_reservation">["Args"];
export type ReservationIdParams = { id: string };
export type ListUserActiveReservationsQuery = { p_renter_id?: string };
export type CountUserPastReservationsQuery = { p_renter_id?: string };
export type ListUserPastReservationsQuery = {
  p_renter_id?: string;
  p_page?: number;
  p_page_size?: number;
};
export type ListHostMonthlyReservationsQuery = {
  p_host_id?: string;
  p_month?: number;
};

const optionalUuidQuerySchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.uuid().optional()
);

const optionalPositiveIntQuerySchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.coerce.number().int().min(1).optional()
);

const optionalMonthQuerySchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.coerce.number().int().min(1).max(12).optional()
);

export const reservationIdParamsSchema = z.object({
  id: z.uuid(),
});

export const createReservationBodySchema = z.object({
  p_listing_id: z.uuid(),
  p_start_at: z.string().min(1),
  p_end_at: z.string().min(1),
  p_guests: z.coerce.number().int().min(1).optional(),
}).strict();

export const listUserActiveReservationsQuerySchema = z.object({
  p_renter_id: optionalUuidQuerySchema,
}).strict();

export const countUserPastReservationsQuerySchema = z.object({
  p_renter_id: optionalUuidQuerySchema,
}).strict();

export const listUserPastReservationsQuerySchema = z.object({
  p_renter_id: optionalUuidQuerySchema,
  p_page: optionalPositiveIntQuerySchema,
  p_page_size: optionalPositiveIntQuerySchema,
}).strict();

export const listHostMonthlyReservationsQuerySchema = z.object({
  p_host_id: optionalUuidQuerySchema,
  p_month: optionalMonthQuerySchema,
}).strict();
