import { z } from "zod";

export type ListListingWeekSlotsQuery = {
  p_listing_id: string;
  p_week?: string;
};
export type ListListingMonthSlotsQuery = {
  p_listing_id: string;
  p_month?: string;
};
export type UpsertListingWeeklySlotBody = {
  p_listing_id: string;
  p_weekday: number;
  p_hour: number;
  p_price: number;
};
export type SetListingWeeklySlotsBody = {
  p_listing_id: string;
  p_slots: Array<{ weekday: number; hour: number; price: number }>;
};

const optionalDateStringSchema = z.preprocess(
  (value) => {
    if (value == null || value === "") return undefined;
    return value;
  },
  z.string().min(1).optional()
);

export const listListingWeekSlotsQuerySchema = z.object({
  p_listing_id: z.uuid(),
  p_week: optionalDateStringSchema,
}).strict();

export const listListingMonthSlotsQuerySchema = z.object({
  p_listing_id: z.uuid(),
  p_month: optionalDateStringSchema,
}).strict();

export const upsertListingWeeklySlotBodySchema = z.object({
  p_listing_id: z.uuid(),
  p_weekday: z.coerce.number().int().min(0).max(6),
  p_hour: z.coerce.number().int().min(0).max(23),
  p_price: z.coerce.number().min(0),
}).strict();

export const setListingWeeklySlotsBodySchema = z.object({
  p_listing_id: z.uuid(),
  p_slots: z.array(
    z.object({
      weekday: z.coerce.number().int().min(0).max(6),
      hour: z.coerce.number().int().min(0).max(23),
      price: z.coerce.number().min(0),
    }).strict()
  ),
}).strict();
