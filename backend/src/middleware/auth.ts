import type { FastifyRequest } from "fastify";

import { createPublicSupabaseClient } from "../clients/supabase";

export async function requireAccessToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    const error = new Error("Missing bearer token") as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    throw error;
  }

  const accessToken = authorization.slice("Bearer ".length).trim();

  if (!accessToken) {
    const error = new Error("Missing bearer token") as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    throw error;
  }

  const supabase = createPublicSupabaseClient();
  const { data, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !data.user) {
    const error = new Error(authError?.message ?? "Unauthorized") as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    throw error;
  }

  return {
    accessToken,
    user: data.user,
  };
}
