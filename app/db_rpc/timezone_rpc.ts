import { processRpcRequest } from "~/app/api/supabase/helpers";
import type { TimeZonePreferenceSettings } from "@/types/custom/api.types";

const getCurrentUserTimeZonePreference = async () => {
  return await processRpcRequest("get_current_user_time_zone_preference");
};

const updateCurrentUserTimeZonePreference = async (timeZone: string | null) => {
  return await processRpcRequest("update_current_user_time_zone_preference", {
    p_time_zone: timeZone,
  });
};

export {
  getCurrentUserTimeZonePreference,
  updateCurrentUserTimeZonePreference,
};
export type { TimeZonePreferenceSettings };
