import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { getOptionalAccessToken } from "../middleware/auth";
import {
  publicProfileParamsSchema,
  publicProfileQuerySchema,
} from "../schemas/profile";
import { getPublicProfileService } from "../services/profile";

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profiles/:id", async (request, reply) => {
    try {
      const auth = await getOptionalAccessToken(request);
      const params = publicProfileParamsSchema.parse(request.params);
      const query = publicProfileQuerySchema.parse(request.query ?? {});
      const profile = await getPublicProfileService({
        userId: params.id,
        query,
        accessToken: auth?.accessToken,
      });

      return reply.code(200).send({ profile });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to get public profile");
    }
  });
}
