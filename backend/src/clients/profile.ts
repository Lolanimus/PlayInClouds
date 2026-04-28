import type { PublicProfile } from "../../../app/types/custom/api.types";

import { requireClientResult, withClientErrorHandling } from "../lib/client-errors";
import { getPublicProfileRpc } from "../middleware/db_rpc/profile_rpc";
import type { PublicProfileQuery } from "../schemas/profile";

export async function getPublicProfile(args: {
  userId: string;
  query: PublicProfileQuery;
  accessToken?: string;
}) {
  return withClientErrorHandling(async () => {
    const data = await getPublicProfileRpc(args);

    return requireClientResult(data, "Profile not found", 404) as PublicProfile;
  }, "Failed to get public profile");
}
