import fp from "fastify-plugin";
import { MatchingEngine } from "../modules/matching/matching.engine.js";
import { createSocketMatchingNotifier } from "../modules/matching/matching.notifier.js";
import { getCachedTrustScore } from "../modules/trust-score/trust-score.cache.js";

declare module "fastify" {
  interface FastifyInstance {
    matching: MatchingEngine;
  }
}

const RECONCILE_INTERVAL_MS = 30_000;

export const matchingPlugin = fp(
  async (app) => {
    const engine = new MatchingEngine({
      prisma: app.prisma,
      redis: app.redis,
      notifier: createSocketMatchingNotifier(app.io),
      trust: { getTrust: (userId) => getCachedTrustScore(app.prisma, app.redis, userId) },
      logger: app.log,
    });

    app.decorate("matching", engine);

    const reconcileTimer = setInterval(() => {
      engine.reconcileStale().catch((err: unknown) => {
        app.log.error({ err }, "falha ao reconciliar buscas travadas do matching");
      });
    }, RECONCILE_INTERVAL_MS);
    reconcileTimer.unref();

    app.addHook("onClose", async () => {
      clearInterval(reconcileTimer);
      engine.stopAll();
    });
  },
  { name: "matching", dependencies: ["prisma", "redis", "socket"] },
);
