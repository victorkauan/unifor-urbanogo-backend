import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyJwt } from "../auth/auth.middleware.js";
import { createQuote } from "./quotes.controller.js";

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).optional(),
});

const quoteBodySchema = z.object({
  type: z.enum(["ride", "delivery"]),
  origin: geoPointSchema,
  destination: geoPointSchema,
});

export const quoteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/", { preHandler: verifyJwt, schema: { body: quoteBodySchema } }, createQuote);
};
