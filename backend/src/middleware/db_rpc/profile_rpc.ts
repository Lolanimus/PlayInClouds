import type { PublicProfile } from "../../../../app/types/custom/api.types";

import {
  createAuthedSupabaseClient,
  createPublicSupabaseClient,
} from "../../clients/supabase";
import type { PublicProfileQuery } from "../../schemas/profile";

export async function getPublicProfileRpc(args: {
  userId: string;
  query: PublicProfileQuery;
  accessToken?: string;
}) {
  const supabase = args.accessToken
    ? createAuthedSupabaseClient(args.accessToken)
    : createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_profile", {
    p_user_id: args.userId,
    p_limit: args.query.p_limit ?? 12,
    p_offset: args.query.p_offset ?? 0,
  } as never);

  if (error) throw error;

  return data as PublicProfile | null;
}
