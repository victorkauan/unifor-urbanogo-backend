import { randomUUID } from "node:crypto";
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { config } from "./lib/config.js";
import { AppError } from "./lib/errors.js";
import { responsePlugin } from "./lib/response.js";
import { matchingPlugin } from "./plugins/matching.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { redisPlugin } from "./plugins/redis.js";
import { socketPlugin } from "./plugins/socket.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { userRoutes } from "./modules/users/users.routes.js";
import { driverRoutes } from "./modules/drivers/drivers.routes.js";
import { ratingRoutes } from "./modules/ratings/ratings.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { offerRoutes } from "./modules/offers/offers.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
            }
          : undefined,
    },
    genReqId(req) {
      const upstreamId = req.headers["x-request-id"];
      return typeof upstreamId === "string" && upstreamId.length > 0 ? upstreamId : randomUUID();
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-request-id", req.id);
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    reply.fail(404, `Rota não encontrada: ${req.method} ${req.url}`);
  });

  app.setErrorHandler((error: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.fail(error.statusCode, error.message, error.data);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = error.validation.map((entry) => {
        const issue = entry.params.issue;
        return {
          path: issue.path.length > 0 ? issue.path.join(".") : (entry.instancePath ?? ""),
          message: issue.message,
        };
      });
      return reply.fail(422, "Payload inválido", { errors });
    }

    if (error.validation) {
      const errors = error.validation.map((issue) => ({
        path: issue.instancePath || issue.schemaPath,
        message: issue.message ?? "inválido",
      }));
      return reply.fail(422, "Payload inválido", { errors });
    }

    const status = error.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err: error }, "unhandled error");
      return reply.fail(status, "Erro interno");
    }
    return reply.fail(status, error.message);
  });

  await app.register(responsePlugin);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(socketPlugin);
  await app.register(matchingPlugin);

  await app.register(healthRoutes);
  await app.register(userRoutes, { prefix: "/users" });
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(ratingRoutes, { prefix: "/ratings" });
  await app.register(driverRoutes, { prefix: "/drivers" });
  await app.register(offerRoutes, { prefix: "/offers" });

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
