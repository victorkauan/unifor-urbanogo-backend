import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { login, me, register } from "./auth.controller.js";
import { verifyJwt } from "./auth.middleware.js";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(8).max(20).optional(),
  role: z.enum(["passenger", "driver", "both"]),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/register", { schema: { body: registerSchema } }, register);
  app.post("/login", { schema: { body: loginSchema } }, login);
  app.get("/me", { preHandler: verifyJwt }, me);
};
