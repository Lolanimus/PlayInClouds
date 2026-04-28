import type { FastifyRequest } from "fastify";

import { getActorContextByUserId } from "../clients/actors";
import { assertActiveActor, type ActorContext } from "../lib/authorization";
import { throwClientError } from "../lib/client-errors";
import { createPublicSupabaseClient } from "../clients/supabase";

type RequireAccessTokenOptions = {
  allowInactive?: boolean;
};

function getBearerToken(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  return accessToken || null;
}

export type AuthenticatedActor = {
  accessToken: string;
  user: Awaited<ReturnType<ReturnType<typeof createPublicSupabaseClient>["auth"]["getUser"]>>["data"]["user"];
  actor: ActorContext;
};

export async function requireAccessToken(
  request: FastifyRequest,
  options: RequireAccessTokenOptions = {}
): Promise<AuthenticatedActor> {
  const accessToken = getBearerToken(request.headers.authorization);

  if (!accessToken) {
    throwClientError("Missing bearer token", 401);
  }

  const supabase = createPublicSupabaseClient();
  const { data, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !data.user) {
    throwClientError(authError?.message ?? "Unauthorized", 401);
  }

  const actor = await getActorContextByUserId({
    accessToken,
    userId: data.user.id,
  });

  if (!actor) {
    throwClientError("User profile not found", 401);
  }

  if (!options.allowInactive) {
    assertActiveActor(actor);
  }

  return {
    accessToken,
    user: data.user,
    actor,
  };
}

export async function getOptionalAccessToken(
  request: FastifyRequest,
  options: RequireAccessTokenOptions = {}
): Promise<AuthenticatedActor | null> {
  const accessToken = getBearerToken(request.headers.authorization);

  if (!accessToken) {
    return null;
  }

  return requireAccessToken(request, options);
}
