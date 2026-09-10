import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { getTrustScore } from "./trust-score.service.js";

const CACHE_TTL_SECONDS = 60;

export function trustScoreCacheKey(userId: string): string {
  return `trust:${userId}`;
}

/**
 * Trust score with a short-lived Redis cache, for the matching engine which asks
 * for one score per candidate on every search. The `GET /users/:id/trust-score`
 * endpoint still calls `getTrustScore` directly so it always recomputes.
 */
export async function getCachedTrustScore(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
): Promise<number> {
  try {
    const cached = await redis.get(trustScoreCacheKey(userId));
    if (cached !== null) {
      const value = Number(cached);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  } catch {
    return getTrustScore(prisma, userId);
  }

  const score = await getTrustScore(prisma, userId);
  try {
    await redis.set(trustScoreCacheKey(userId), String(score), "EX", CACHE_TTL_SECONDS);
  } catch {
    // cache de escrita indisponível: segue sem cachear
  }
  return score;
}
