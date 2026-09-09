import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyJwt } from "../auth/auth.middleware.js";
import { acceptOffer, rejectOffer } from "./offers.controller.js";

const offerParamsSchema = z.object({ offerId: z.string().uuid() });

export const offerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/:offerId/accept",
    { preHandler: verifyJwt, schema: { params: offerParamsSchema } },
    acceptOffer,
  );

  app.post(
    "/:offerId/reject",
    { preHandler: verifyJwt, schema: { params: offerParamsSchema } },
    rejectOffer,
  );
};
