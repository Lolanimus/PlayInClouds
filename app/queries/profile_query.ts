import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as profileEvents from "~/api/backend/profile";

export const profile = createQueryKeys("profile", {
  detail: (p?: { p_user_id?: string; p_limit?: number; p_offset?: number }) => ({
    queryKey: ["detail", p],
    queryFn: () => profileEvents.getPublicProfile(
      p?.p_user_id ?? "",
      p?.p_limit,
      p?.p_offset
    ),
  }),
});
