import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { requireAccessToken } from "../middleware/auth";
import { createConnectOnboardingLinkBodySchema } from "../schemas/connect";
import {
  createConnectOnboardingLinkService,
  getConnectAccountStatusService,
} from "../services/connect";

export async function registerConnectRoutes(app: FastifyInstance) {
  app.get("/api/connect/account", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const account = await getConnectAccountStatusService({
        actor: auth.actor,
      });

      return reply.code(200).send({ account });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to get Stripe Connect account");
    }
  });

  app.post("/api/connect/account/onboarding-link", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const body = createConnectOnboardingLinkBodySchema.parse(request.body ?? {});
      const account = await createConnectOnboardingLinkService({
        actor: auth.actor,
        input: body,
      });

      return reply.code(200).send({ account });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to create Stripe onboarding link");
    }
  });
}
