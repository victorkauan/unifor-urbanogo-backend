import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyJwt } from "../auth/auth.middleware.js";
import { getUserRatings } from "../ratings/ratings.controller.js";
import { getUserTrustScore } from "../trust-score/trust-score.controller.js";
import { deleteMe, getMe, updateMe } from "./users.controller.js";

const updateMeSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(8).max(20).optional(),
});

const userIdParams = z.object({ userId: z.string().uuid() });

const ratingsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/me", { preHandler: verifyJwt }, getMe);
  app.patch("/me", { preHandler: verifyJwt, schema: { body: updateMeSchema } }, updateMe);
  app.delete("/me", { preHandler: verifyJwt }, deleteMe);

  app.get(
    "/:userId/ratings",
    { preHandler: verifyJwt, schema: { params: userIdParams, querystring: ratingsQuery } },
    getUserRatings,
  );
  app.get(
    "/:userId/trust-score",
    { preHandler: verifyJwt, schema: { params: userIdParams } },
    getUserTrustScore,
  );
};
