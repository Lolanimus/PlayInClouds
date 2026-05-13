import { z } from "zod";

export const createConnectOnboardingLinkBodySchema = z.object({
  returnPath: z.string().startsWith("/").optional(),
  refreshPath: z.string().startsWith("/").optional(),
}).strict();

export type CreateConnectOnboardingLinkBody = z.infer<typeof createConnectOnboardingLinkBodySchema>;
