import { z } from "zod";

export type PublicProfileParams = { id: string };
export type PublicProfileQuery = {
  p_limit?: number;
  p_offset?: number;
};

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

export const publicProfileParamsSchema = z.object({
  id: z.uuid(),
});

export const publicProfileQuerySchema = z.object({
  p_limit: optionalPositiveIntQuerySchema,
  p_offset: optionalNonNegativeIntQuerySchema,
}).strict();
