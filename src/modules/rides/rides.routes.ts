import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyJwt } from "../auth/auth.middleware.js";
import { cancelRide, createRide, getRide, listRides } from "./rides.controller.js";

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

const listRidesQuerySchema = z.object({
  role: z.enum(["passenger", "driver"]).optional(),
  status: z
    .enum([
      "requested",
      "searching",
      "assigned",
      "in_progress",
      "completed",
      "cancelled",
      "expired",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const rideParamsSchema = z.object({ rideId: z.string().uuid() });

export const rideRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/", { preHandler: verifyJwt, schema: { body: createRideSchema } }, createRide);

  app.get("/", { preHandler: verifyJwt, schema: { querystring: listRidesQuerySchema } }, listRides);

  app.get("/:rideId", { preHandler: verifyJwt, schema: { params: rideParamsSchema } }, getRide);

  app.post(
    "/:rideId/cancel",
    { preHandler: verifyJwt, schema: { params: rideParamsSchema } },
    cancelRide,
  );
};
