import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { createRating, getUserRatings } from "./ratings.controller.js";

export const ratingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/",
    {
      schema: {
        body: z.object({
          rideId: z.string().uuid("Ride ID must be a valid UUID"),
          score: z.number().int().min(1).max(5, "Score must be between 1 and 5"),
          comment: z.string().optional(),
        }),
      },
    },
    createRating,
  );

  app.get(
    "/users/:userId",
    {
      schema: {
        params: z.object({
          userId: z.string().uuid("User ID must be a valid UUID"),
        }),
      },
    },
    getUserRatings,
  );
};
