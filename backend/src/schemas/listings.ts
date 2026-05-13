import { z } from "zod";
import type { Database } from "../../../app/types/database-generated.types";
import type { Function } from "../../../app/types/custom/rpc.types";

type UpdateListingArgs = Function<"update_listing">["Args"];
export type UpdateListingBody = Omit<UpdateListingArgs, "p_id">;
export type UpdateListingParams = { id: UpdateListingArgs["p_id"] };
export type CreateListingBody = {
  p_lat: number;
  p_lng: number;
  p_address: string;
  p_title: string;
  p_subtitle: string;
  p_category: Database["public"]["Enums"]["listing_category"];
  p_price: number;
  p_images: string[];
  p_description: string;
  p_equipment_desc: string;
  p_conveniences_desc: string;
  p_area_m2: number;
  p_cancellation_policy_hours?: number | null;
  p_advance_notice_hours?: number | null;
  p_timezone?: string;
  p_host_confirmation_message?: string;
  p_rules?: string;
  p_instructions?: string;
};
export type ListListingsQuery = {
  p_address?: string;
  p_category?: Database["public"]["Enums"]["listing_category"];
  p_min_price?: number;
  p_max_price?: number;
  p_limit?: number;
  p_offset?: number;
};
export type ModerateListingBody = { p_message?: string | null };

const listingCategoryValues = [
  "REHEARSAL_SPACE",
  "RECORDING_STUDIO",
  "OTHER",
] as const satisfies readonly Database["public"]["Enums"]["listing_category"][];

const optionalTrimmedStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().optional()
);

const optionalNullableMessageSchema = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().nullable().optional()
);

const optionalNumberQuerySchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.coerce.number().optional()
);

const optionalIntegerQuerySchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.coerce.number().int().min(0).optional()
);

export const listingCategorySchema = z.enum([
  ...listingCategoryValues,
]);

export const updateListingParamsSchema = z.object({
  id: z.uuid(),
});

export const createListingBodySchema = z.object({
  p_lat: z.number(),
  p_lng: z.number(),
  p_address: z.string(),
  p_title: z.string(),
  p_subtitle: z.string(),
  p_category: listingCategorySchema,
  p_price: z.number(),
  p_images: z.array(z.string()),
  p_description: z.string(),
  p_equipment_desc: z.string(),
  p_conveniences_desc: z.string(),
  p_area_m2: z.number().positive(),
  p_cancellation_policy_hours: z.number().int().min(0).nullish(),
  p_advance_notice_hours: z.number().int().min(0).nullish(),
  p_timezone: z.string().optional(),
  p_host_confirmation_message: z.string().optional(),
  p_rules: z.string().optional(),
  p_instructions: z.string().optional(),
}).strict();

export const listListingsQuerySchema = z.object({
  p_address: optionalTrimmedStringSchema,
  p_category: z.preprocess(
    (value) => {
      if (value == null || value === "") return undefined;
      return value;
    },
    listingCategorySchema.optional()
  ),
  p_min_price: optionalNumberQuerySchema,
  p_max_price: optionalNumberQuerySchema,
  p_limit: optionalIntegerQuerySchema,
  p_offset: optionalIntegerQuerySchema,
}).strict();

export const moderateListingBodySchema = z.object({
  p_message: optionalNullableMessageSchema,
}).strict();

export const updateListingBodySchema = z
  .object({
    p_lat: z.number().optional(),
    p_lng: z.number().optional(),
    p_address: z.string().optional(),
    p_title: z.string().optional(),
    p_subtitle: z.string().optional(),
    p_category: listingCategorySchema.optional(),
    p_price: z.number().optional(),
    p_images: z.array(z.string()).optional(),
    p_description: z.string().optional(),
    p_equipment_desc: z.string().optional(),
    p_conveniences_desc: z.string().optional(),
    p_area_m2: z.number().positive().optional(),
    p_cancellation_policy_hours: z.number().int().min(0).nullish(),
    p_advance_notice_hours: z.number().int().min(0).nullish(),
    p_timezone: z.string().optional(),
    p_host_confirmation_message: z.string().optional(),
    p_rules: z.string().optional(),
    p_instructions: z.string().optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Provide at least one listing field to update"
  );
