import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  DRIVER_PRESENCE_WINDOW_MS,
  getDemandRatio,
  gridCell,
  recordDriverPresence,
  recordRideRequest,
} from "./demand-signal.repo.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("demand signal repo", () => {
  let redis: Redis;
  const point = { lat: -3.7319, lng: -38.5267 };

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL as string);
  });

  afterEach(async () => {
    const keys = await redis.keys("demand:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("returns undefined with no recent requests", async () => {
    await expect(getDemandRatio(redis, point)).resolves.toBeUndefined();
  });

  it("returns a high ratio when there are requests but no drivers online", async () => {
    await recordRideRequest(redis, point);

    const ratio = await getDemandRatio(redis, point);
    expect(ratio).toBeGreaterThan(1);
  });

  it("computes requests-per-driver once drivers are present", async () => {
    await recordDriverPresence(redis, randomUUID(), point);
    await recordDriverPresence(redis, randomUUID(), point);
    await recordRideRequest(redis, point);
    await recordRideRequest(redis, point);

    const ratio = await getDemandRatio(redis, point);
    expect(ratio).toBe(1);
  });

  it("does not count stale driver presence outside the window", async () => {
    const now = Date.now();
    await recordDriverPresence(redis, randomUUID(), point, now - DRIVER_PRESENCE_WINDOW_MS - 1_000);
    await recordRideRequest(redis, point, now);

    const ratio = await getDemandRatio(redis, point, now);
    expect(ratio).toBeGreaterThan(1);
  });

  it("keeps separate cells independent", async () => {
    const farAway = { lat: point.lat + 5, lng: point.lng + 5 };
    await recordDriverPresence(redis, randomUUID(), farAway);
    await recordRideRequest(redis, point);

    const ratio = await getDemandRatio(redis, point);
    expect(ratio).toBeGreaterThan(1);
    expect(gridCell(point)).not.toBe(gridCell(farAway));
  });
});
