import fp from "fastify-plugin";
import { httpRequestsTotal, registry } from "../lib/metrics.js";
import { snapshotDemandMetrics } from "../modules/realtime/demand-signal.repo.js";

/** RT-5 / OBS-4: com que frequência os gauges de demanda por região são recalculados. */
const DEMAND_SNAPSHOT_INTERVAL_MS = 15_000;

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

    let interval: NodeJS.Timeout | undefined;
    app.addHook("onReady", async () => {
      interval = setInterval(() => {
        snapshotDemandMetrics(app.redis).catch((err: unknown) => {
          app.log.error({ err }, "falha ao atualizar métricas de demanda por região");
        });
      }, DEMAND_SNAPSHOT_INTERVAL_MS);
      interval.unref();
    });

    app.addHook("onClose", async () => {
      clearInterval(interval);
    });
  },
  { name: "metrics" },
);
