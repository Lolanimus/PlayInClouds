import type { FastifyInstance } from "fastify";

import { sendRouteError } from "../lib/http";
import { requireAccessToken } from "../middleware/auth";
import {
  createListingBodySchema,
  listListingsQuerySchema,
  moderateListingBodySchema,
  updateListingBodySchema,
  updateListingParamsSchema,
} from "../schemas/listings";
import {
  approveListingService,
  createListingService,
  currentUserIsAdminService,
  deleteListingService,
  getListingService,
  listListingsService,
  listOwnListingsService,
  listPendingListingsService,
  rejectListingService,
  updateListingService,
} from "../services/listings";

export async function registerListingRoutes(app: FastifyInstance) {
  app.get("/api/listings/me/own", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const listings = await listOwnListingsService({ accessToken: auth.accessToken });

      return reply.code(200).send({ listings });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list your listings");
    }
  });

  app.get("/api/listings/moderation/pending", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const listings = await listPendingListingsService({ accessToken: auth.accessToken });

      return reply.code(200).send({ listings });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list pending listings");
    }
  });

  app.get("/api/listings/me/admin-status", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const isAdmin = await currentUserIsAdminService({ accessToken: auth.accessToken });

      return reply.code(200).send({ isAdmin });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to get admin status");
    }
  });

  app.get("/api/listings", async (request, reply) => {
    try {
      const query = listListingsQuerySchema.parse(request.query ?? {});
      const listings = await listListingsService({ query });

      return reply.code(200).send({ listings });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to list listings");
    }
  });

  app.get("/api/listings/:id", async (request, reply) => {
    try {
      const params = updateListingParamsSchema.parse(request.params);
      const listing = await getListingService({ listingId: params.id });

      return reply.code(200).send({ listing });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to get listing");
    }
  });

  app.post("/api/listings", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const body = createListingBodySchema.parse(request.body ?? {});
      const listing = await createListingService({
        accessToken: auth.accessToken,
        input: body,
      });

      return reply.code(201).send({ listing });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to create listing");
    }
  });

  app.patch("/api/listings/:id", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = updateListingParamsSchema.parse(request.params);
      const body = updateListingBodySchema.parse(request.body ?? {});

      const listing = await updateListingService({
        accessToken: auth.accessToken,
        listingId: params.id,
        input: body,
      });

      return reply.code(200).send({ listing });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to update listing");
    }
  });

  app.delete("/api/listings/:id", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = updateListingParamsSchema.parse(request.params);
      const deleted = await deleteListingService({
        accessToken: auth.accessToken,
        listingId: params.id,
      });

      return reply.code(200).send({ deleted });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to delete listing");
    }
  });

  app.post("/api/listings/:id/approve", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = updateListingParamsSchema.parse(request.params);
      const body = moderateListingBodySchema.parse(request.body ?? {});
      const listing = await approveListingService({
        accessToken: auth.accessToken,
        listingId: params.id,
        input: body,
      });

      return reply.code(200).send({ listing });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to approve listing");
    }
  });

  app.post("/api/listings/:id/reject", async (request, reply) => {
    try {
      const auth = await requireAccessToken(request);
      const params = updateListingParamsSchema.parse(request.params);
      const body = moderateListingBodySchema.parse(request.body ?? {});
      const listing = await rejectListingService({
        accessToken: auth.accessToken,
        listingId: params.id,
        input: body,
      });

      return reply.code(200).send({ listing });
    } catch (error) {
      return sendRouteError(reply, error, "Failed to reject listing");
    }
  });
}
