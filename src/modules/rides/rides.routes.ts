import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyJwt } from "../auth/auth.middleware.js";
import { createRide, getRide } from "./rides.controller.js";

const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).optional(),
});

const createRideSchema = z.object({
  type: z.enum(["ride", "delivery"]),
  origin: geoPointSchema,
  destination: geoPointSchema,
});

const rideParamsSchema = z.object({ rideId: z.string().uuid() });

export const rideRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/", { preHandler: verifyJwt, schema: { body: createRideSchema } }, createRide);

  app.get("/:rideId", { preHandler: verifyJwt, schema: { params: rideParamsSchema } }, getRide);
};
