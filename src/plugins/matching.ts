import fp from "fastify-plugin";
import { MatchingEngine } from "../modules/matching/matching.engine.js";
import { createSocketMatchingNotifier } from "../modules/matching/matching.notifier.js";
import { getCachedTrustScore } from "../modules/trust-score/trust-score.cache.js";

declare module "fastify" {
  interface FastifyInstance {
    matching: MatchingEngine;
  }
}

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

    app.addHook("onClose", async () => {
      engine.stopAll();
    });
  },
  { name: "matching", dependencies: ["prisma", "redis", "socket"] },
);
