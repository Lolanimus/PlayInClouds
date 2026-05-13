import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { requireAccessToken } from "../middleware/auth";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request, { allowInactive: true });

      return reply.code(200).send({ actor: auth.actor });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to get current actor");
    }
  });
}