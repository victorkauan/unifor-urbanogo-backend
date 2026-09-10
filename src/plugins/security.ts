import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";
import { config } from "../lib/config.js";
import { corsOrigins } from "../lib/cors.js";

const RATE_LIMIT_EXEMPT_PATHS = new Set(["/health", "/ready", "/metrics"]);

/**
 * Hardening da API (SEC-3): cabeçalhos de segurança (helmet), CORS e rate
 * limiting compartilhado no Redis. TLS fica a cargo do Caddy no deploy (INF-3).
 */
export const securityPlugin = fp(
  async (app) => {
    await app.register(helmet);

    const origin = corsOrigins();
    if (origin === true && config.NODE_ENV === "production") {
      app.log.warn("CORS_ORIGINS não definido: a API aceita qualquer origem");
    }
    await app.register(cors, {
      origin,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    });

    await app.register(rateLimit, {
      global: true,
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW_MS,
      redis: app.redis,
      allowList: (req) => RATE_LIMIT_EXEMPT_PATHS.has(req.url),
    });
  },
  { name: "security", dependencies: ["redis"] },
);
