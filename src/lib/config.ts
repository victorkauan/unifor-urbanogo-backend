import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  DEEPINFRA_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  DEEPINFRA_TRUST_MODEL: z.string().default("meta-llama/Meta-Llama-3.3-70B-Instruct"),
  RIDE_LOCATION_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  DRIVER_LOCATION_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  LOCATION_RETENTION_SWEEP_HOURS: z.coerce.number().int().positive().default(24),
  CORS_ORIGINS: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
