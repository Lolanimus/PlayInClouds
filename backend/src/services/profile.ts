import { getPublicProfile } from "../clients/profile";
import type { PublicProfileQuery } from "../schemas/profile";

export async function getPublicProfileService(args: {
  userId: string;
  query: PublicProfileQuery;
}) {
  return getPublicProfile(args);
}
