import { config } from "./config.js";

/**
 * Origens liberadas no CORS, compartilhadas pela API HTTP e pelo Socket.IO.
 * Sem `CORS_ORIGINS` a API reflete qualquer origem (conveniente para dev; em
 * produção o plugin de segurança loga um aviso).
 */
export function corsOrigins(): string[] | boolean {
  if (!config.CORS_ORIGINS) {
    return true;
  }
  return config.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
