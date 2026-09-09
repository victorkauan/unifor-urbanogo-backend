import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { verifyJwt } from "../auth/auth.middleware.js";
import { createMe, getMe, updateMe } from "./drivers.controller.js";

const servicePreferenceSchema = z.enum(["rides", "deliveries", "both"]);

const createDriverSchema = z.object({
  service_preference: servicePreferenceSchema,
  vehicle_model: z.string().min(1).optional(),
  vehicle_plate: z.string().min(1).optional(),
});

const updateDriverSchema = z.object({
  service_preference: servicePreferenceSchema.optional(),
  vehicle_model: z.string().min(1).optional(),
  vehicle_plate: z.string().min(1).optional(),
});

export const driverRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/me", { preHandler: verifyJwt, schema: { body: createDriverSchema } }, createMe);
  app.get("/me", { preHandler: verifyJwt }, getMe);
  app.patch("/me", { preHandler: verifyJwt, schema: { body: updateDriverSchema } }, updateMe);
};
