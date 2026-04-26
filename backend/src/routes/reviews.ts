import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { requireAccessToken } from "../middleware/auth";
import {
  createReservationReviewBodySchema,
  listReviewsQuerySchema,
  reviewIdParamsSchema,
  updateReservationReviewBodySchema,
} from "../schemas/reviews";
import {
  createReservationReviewService,
  listPendingReservationReviewsService,
  listReviewsService,
  updateReservationReviewService,
} from "../services/reviews";

export async function registerReviewRoutes(app: FastifyInstance) {
  app.get("/api/reviews/pending-reservation", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const reviews = await listPendingReservationReviewsService({
        accessToken: auth.accessToken,
      });

      return reply.code(200).send({ reviews });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list pending reservation reviews");
    }
  });

  app.get("/api/reviews", async (request, reply) => {
    try {
      const query = listReviewsQuerySchema.parse(request.query ?? {});
      const reviews = await listReviewsService({ query });

      return reply.code(200).send({ reviews });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list reviews");
    }
  });

  app.post("/api/reviews/reservation", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const body = createReservationReviewBodySchema.parse(request.body ?? {});
      const review = await createReservationReviewService({
        accessToken: auth.accessToken,
        input: body,
      });

      return reply.code(201).send({ review });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to create reservation review");
    }
  });

  app.patch("/api/reviews/:id", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = reviewIdParamsSchema.parse(request.params);
      const body = updateReservationReviewBodySchema.parse(request.body ?? {});
      const review = await updateReservationReviewService({
        accessToken: auth.accessToken,
        reviewId: params.id,
        input: body,
      });

      return reply.code(200).send({ review });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to update reservation review");
    }
  });
}
