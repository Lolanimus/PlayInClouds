import type { PublicProfile } from "@/types/custom/api.types";

import { buildQueryString, requestBackend } from "./shared";

export async function getPublicProfile(
  p_user_id: string,
  p_limit = 12,
  p_offset = 0
): Promise<PublicProfile> {
  const payload = await requestBackend<{ profile: PublicProfile }>({
    path: `/api/profiles/${p_user_id}${buildQueryString({ p_limit, p_offset })}`,
    fallbackMessage: "Failed to get public profile",
  });

  return payload.profile;
}
