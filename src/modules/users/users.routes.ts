import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { getProfile, updateProfile, deleteProfile } from "./users.controller.js";

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/profile", getProfile);

  app.patch(
    "/profile",
    {
      schema: {
        body: z.object({
          name: z.string().min(2).optional(),
          phone: z.string().optional(),
        }),
      },
    },
    updateProfile,
  );

  app.delete("/profile", deleteProfile);
};
