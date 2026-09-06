import type { FastifyInstance } from "fastify";

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
}
