import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { config } from "./lib/config.js";
import { AppError } from "./lib/errors.js";
import { responsePlugin } from "./lib/response.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { redisPlugin } from "./plugins/redis.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { userRoutes } from "./modules/users/users.routes.js";

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
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(responsePlugin);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  await app.register(healthRoutes);
  await app.register(userRoutes, { prefix: "/users" });

  app.setNotFoundHandler((req, reply) => {
    reply.fail(404, `Rota não encontrada: ${req.method} ${req.url}`);
  });

  app.setErrorHandler((error: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.fail(error.statusCode, error.message, error.data);
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

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
