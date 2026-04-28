import type { ActorContextPayload } from "../../../app/types/custom/api.types";

import { createAuthedSupabaseClient } from "./supabase";
import { buildActorContext, type ActorContext, type UserRole } from "../lib/authorization";

export async function getActorContextByUserId(args: {
  accessToken: string;
  userId: string;
}): Promise<ActorContext | null> {
  const supabase = createAuthedSupabaseClient(args.accessToken);

  const { data, error } = await supabase.rpc("get_actor_context_by_user_id", {
    p_user_id: args.userId,
  });

  if (error) {
    throw error;
  }

  const actorPayload = data as ActorContextPayload | null;

  if (!actorPayload) {
    return null;
  }

  return buildActorContext({
    userId: actorPayload.userId,
    email: actorPayload.email,
    accountStatus: actorPayload.accountStatus,
    roles: actorPayload.roles.map((role) => role as UserRole),
  });
}