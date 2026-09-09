import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../../../test/db.js";
import { createTestUser } from "../../../test/fixtures.js";
import { getCachedTrustScore, trustScoreCacheKey } from "./trust-score.cache.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("getCachedTrustScore", () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL as string);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await redis.flushall();
  });

  async function addRating(rateeId: string, score: number) {
    const rater = await createTestUser(prisma);
    const ride = await prisma.ride.create({
      data: {
        passengerId: rateeId,
        type: "ride",
        status: "completed",
        originLat: 0,
        originLng: 0,
        destLat: 0,
        destLng: 0,
      },
    });
    await prisma.rating.create({ data: { rideId: ride.id, raterId: rater.id, rateeId, score } });
  }

  it("serves a cached value until the key is invalidated", async () => {
    const user = await createTestUser(prisma);

    expect(await getCachedTrustScore(prisma, redis, user.id)).toBe(1);
    expect(await redis.get(trustScoreCacheKey(user.id))).toBe("1");

    await addRating(user.id, 3);
    await addRating(user.id, 5);

    // still cached
    expect(await getCachedTrustScore(prisma, redis, user.id)).toBe(1);

    await redis.del(trustScoreCacheKey(user.id));
    expect(await getCachedTrustScore(prisma, redis, user.id)).toBe(0.75);
  });
});
