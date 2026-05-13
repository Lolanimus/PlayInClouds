import { z } from "zod";

export type CreateReservationReviewBody = {
  p_reservation_id: string;
  p_rating: number;
  p_text: string;
};
export type UpdateReservationReviewBody = {
  p_rating?: number;
  p_text?: string;
};
export type ListReviewsQuery = {
  p_listing_id?: string;
  p_limit?: number;
  p_offset?: number;
};
export type ReviewIdParams = { id: string };

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

const optionalNonNegativeIntQuerySchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.coerce.number().int().min(0).optional()
);

const optionalReviewTextSchema = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().min(1).optional()
);

export const reviewIdParamsSchema = z.object({
  id: z.uuid(),
});

export const createReservationReviewBodySchema = z.object({
  p_reservation_id: z.uuid(),
  p_rating: z.coerce.number().min(1).max(5),
  p_text: z.string().trim().min(1),
}).strict();

export const updateReservationReviewBodySchema = z.object({
  p_rating: z.coerce.number().min(1).max(5).optional(),
  p_text: optionalReviewTextSchema,
}).strict().refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  "Provide at least one review field to update"
);

export const listReviewsQuerySchema = z.object({
  p_listing_id: optionalUuidQuerySchema,
  p_limit: optionalPositiveIntQuerySchema,
  p_offset: optionalNonNegativeIntQuerySchema,
}).strict();
