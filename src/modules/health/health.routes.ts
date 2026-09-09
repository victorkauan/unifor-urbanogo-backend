import type { FastifyInstance } from "fastify";

type DependencyStatus = "ok" | "error";

async function checkPostgres(app: FastifyInstance): Promise<DependencyStatus> {
  try {
    await app.prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch (err) {
    app.log.error({ err }, "readiness: postgres indisponível");
    return "error";
  }
}

async function checkRedis(app: FastifyInstance): Promise<DependencyStatus> {
  try {
    await app.redis.ping();
    return "ok";
  } catch (err) {
    app.log.error({ err }, "readiness: redis indisponível");
    return "error";
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    return reply.ok(
      {
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      "Serviço no ar",
    );
  });

  app.get("/ready", async (_req, reply) => {
    const [postgres, redis] = await Promise.all([checkPostgres(app), checkRedis(app)]);
    const data = { postgres, redis };

    if (postgres === "ok" && redis === "ok") {
      return reply.ok(data, "Pronto");
    }
    return reply.fail(503, "Serviço não está pronto", data);
  });
}
