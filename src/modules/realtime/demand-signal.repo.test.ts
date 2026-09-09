import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { demandDriversOnline, demandRequestsRecent } from "../../lib/metrics.js";
import {
  DRIVER_PRESENCE_WINDOW_MS,
  getDemandRatio,
  gridCell,
  recordDriverPresence,
  recordRideRequest,
  snapshotDemandMetrics,
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

  describe("snapshotDemandMetrics", () => {
    it("publishes a gauge value per active cell", async () => {
      await recordDriverPresence(redis, randomUUID(), point);
      await recordDriverPresence(redis, randomUUID(), point);
      await recordRideRequest(redis, point);

      await snapshotDemandMetrics(redis);

      const cell = gridCell(point);
      expect((await demandDriversOnline.get()).values).toContainEqual(
        expect.objectContaining({ labels: { cell }, value: 2 }),
      );
      expect((await demandRequestsRecent.get()).values).toContainEqual(
        expect.objectContaining({ labels: { cell }, value: 1 }),
      );
    });

    it("drops a cell from the gauge once it has no recent activity", async () => {
      const cell = gridCell(point);
      await recordRideRequest(redis, point);
      await snapshotDemandMetrics(redis);
      expect((await demandRequestsRecent.get()).values).toContainEqual(
        expect.objectContaining({ labels: { cell } }),
      );

      await redis.del(`demand:requests:${cell}`, `demand:drivers:${cell}`);
      await snapshotDemandMetrics(redis);

      expect((await demandRequestsRecent.get()).values).not.toContainEqual(
        expect.objectContaining({ labels: { cell } }),
      );
    });
  });
});
