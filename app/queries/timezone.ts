import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as timezoneRpc from "@/db_rpc/timezone_rpc";

export const timezone = createQueryKeys("timezone", {
  preference: (userId?: string | null) => ({
    queryKey: ["preference", userId ?? "anon"],
    queryFn: async () => {
      if (!userId) {
        return { preferred_time_zone: null };
      }

      return await timezoneRpc.getCurrentUserTimeZonePreference();
    },
  }),
});
