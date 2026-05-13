import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { requireAccessToken } from "../middleware/auth";
import {
  countUserPastReservationsQuerySchema,
  createReservationBodySchema,
  listHostMonthlyReservationsQuerySchema,
  listUserActiveReservationsQuerySchema,
  listUserPastReservationsQuerySchema,
  reservationIdParamsSchema,
} from "../schemas/reservations";
import {
  cancelReservationService,
  confirmReservationService,
  countUserPastReservationsService,
  createReservationService,
  getReservationService,
  listHostMonthlyReservationsService,
  listUserActiveReservationsService,
  listUserPastReservationsService,
} from "../services/reservations";

export async function registerReservationRoutes(app: FastifyInstance) {
  app.get("/api/reservations/active", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const query = listUserActiveReservationsQuerySchema.parse(request.query ?? {});
      const reservations = await listUserActiveReservationsService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        query,
      });

      return reply.code(200).send({ reservations });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list active reservations");
    }
  });

  app.get("/api/reservations/past/count", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const query = countUserPastReservationsQuerySchema.parse(request.query ?? {});
      const count = await countUserPastReservationsService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        query,
      });

      return reply.code(200).send({ count });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to count past reservations");
    }
  });

  app.get("/api/reservations/past", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const query = listUserPastReservationsQuerySchema.parse(request.query ?? {});
      const reservations = await listUserPastReservationsService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        query,
      });

      return reply.code(200).send({ reservations });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list past reservations");
    }
  });

  app.get("/api/reservations/host/monthly", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const query = listHostMonthlyReservationsQuerySchema.parse(request.query ?? {});
      const reservations = await listHostMonthlyReservationsService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        query,
      });

      return reply.code(200).send({ reservations });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list host monthly reservations");
    }
  });

  app.get("/api/reservations/:id", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = reservationIdParamsSchema.parse(request.params);
      const reservation = await getReservationService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        reservationId: params.id,
      });

      return reply.code(200).send({ reservation });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to get reservation");
    }
  });

  app.post("/api/reservations", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const body = createReservationBodySchema.parse(request.body ?? {});
      const reservation = await createReservationService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        input: body,
      });

      return reply.code(201).send({ reservation });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to create reservation");
    }
  });

  app.post("/api/reservations/:id/cancel", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = reservationIdParamsSchema.parse(request.params);
      const reservation = await cancelReservationService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        reservationId: params.id,
      });

      return reply.code(200).send({ reservation });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to cancel reservation");
    }
  });

  app.post("/api/reservations/:id/confirm", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = reservationIdParamsSchema.parse(request.params);
      const reservation = await confirmReservationService({
        actor: auth.actor,
        accessToken: auth.accessToken,
        reservationId: params.id,
      });

      return reply.code(200).send({ reservation });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to confirm reservation");
    }
  });
}
