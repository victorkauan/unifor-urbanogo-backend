import fp from "fastify-plugin";
import { Redis } from "ioredis";
import { config } from "../lib/config.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(
  async (app) => {
    const redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    redis.on("error", (err) => app.log.error({ err }, "redis error"));

    app.decorate("redis", redis);

    app.addHook("onReady", async () => {
      try {
        await redis.connect();
        app.log.info("redis connected");
      } catch (err) {
        app.log.error({ err }, "redis unavailable at boot");
      }
    });

    app.addHook("onClose", async () => {
      await redis.quit();
    });
  },
  { name: "redis" },
);
