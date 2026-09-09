import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getProfile, updateProfile } from "./drivers.controller.js";

export const driverRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/profile", getProfile);

  app.patch(
    "/profile",
    {
      schema: {
        body: z.object({
          servicePreference: z.enum(["rides", "deliveries", "both"]).optional(),
          vehicleModel: z.string().optional(),
          vehiclePlate: z.string().optional(),
        }),
      },
    },
    updateProfile,
  );
};
