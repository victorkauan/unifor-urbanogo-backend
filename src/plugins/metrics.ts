import fp from "fastify-plugin";
import { httpRequestsTotal, registry } from "../lib/metrics.js";

export const metricsPlugin = fp(
  async (app) => {
    app.addHook("onResponse", async (req, reply) => {
      const route = req.routeOptions.url ?? "unmatched";
      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: String(reply.statusCode),
      });
    });

    app.get("/metrics", async (_req, reply) => {
      reply.header("content-type", registry.contentType);
      return registry.metrics();
    });
  },
  { name: "metrics" },
);
