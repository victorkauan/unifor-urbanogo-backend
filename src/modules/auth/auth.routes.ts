import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { register, login } from "./auth.controller.js";

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/register",
    {
      schema: {
        body: z.object({
          name: z.string().min(2),
          email: z.string().email(),
          password: z.string().min(6),
          role: z.enum(["passenger", "driver", "both"]),
        }),
      },
    },
    register
  );

  app.post(
    "/login",
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string(),
        }),
      },
    },
    login
  );
};