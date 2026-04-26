import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { requireAccessToken } from "../middleware/auth";
import {
  listListingMonthSlotsQuerySchema,
  listListingWeekSlotsQuerySchema,
  setListingWeeklySlotsBodySchema,
  upsertListingWeeklySlotBodySchema,
} from "../schemas/hours";
import {
  listListingMonthSlotsService,
  listListingWeekSlotsService,
  setListingWeeklySlotsService,
  upsertListingWeeklySlotService,
} from "../services/hours";

export async function registerHourRoutes(app: FastifyInstance) {
  app.get("/api/hours/week", async (request, reply) => {
    try {
      const query = listListingWeekSlotsQuerySchema.parse(request.query ?? {});
      const slots = await listListingWeekSlotsService({ query });

      return reply.code(200).send({ slots });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list listing week slots");
    }
  });

  app.get("/api/hours/month", async (request, reply) => {
    try {
      const query = listListingMonthSlotsQuerySchema.parse(request.query ?? {});
      const slots = await listListingMonthSlotsService({ query });

      return reply.code(200).send({ slots });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list listing month slots");
    }
  });

  app.post("/api/hours/weekly-slot", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const body = upsertListingWeeklySlotBodySchema.parse(request.body ?? {});
      const slot = await upsertListingWeeklySlotService({
        accessToken: auth.accessToken,
        input: body,
      });

      return reply.code(200).send({ slot });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to upsert listing weekly slot");
    }
  });

  app.put("/api/hours/weekly-slots", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const body = setListingWeeklySlotsBodySchema.parse(request.body ?? {});
      const slots = await setListingWeeklySlotsService({
        accessToken: auth.accessToken,
        input: body,
      });

      return reply.code(200).send({ slots });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to set listing weekly slots");
    }
  });
}
