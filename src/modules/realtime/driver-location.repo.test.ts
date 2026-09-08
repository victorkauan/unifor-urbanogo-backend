import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import {
  DRIVER_LOCATION_TTL_SECONDS,
  driverLocationKey,
  getDriverLocation,
  saveDriverLocation,
} from "./driver-location.repo.js";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as Redis;
}

describe("driver location repo", () => {
  it("saves the location under driver:{userId}:location with a TTL", async () => {
    const redis = fakeRedis();
    const userId = "11111111-1111-1111-1111-111111111111";

    await saveDriverLocation(redis, userId, {
      lat: -3.73,
      lng: -38.52,
      recorded_at: "2026-09-08T12:00:00Z",
    });

    expect(redis.set).toHaveBeenCalledWith(
      driverLocationKey(userId),
      expect.any(String),
      "EX",
      DRIVER_LOCATION_TTL_SECONDS,
    );
  });

  it("round-trips a stored location, adding updated_at", async () => {
    const redis = fakeRedis();
    const userId = "22222222-2222-2222-2222-222222222222";

    await saveDriverLocation(redis, userId, {
      lat: -3.73,
      lng: -38.52,
      heading: 90,
      speed: 12.5,
      recorded_at: "2026-09-08T12:00:00Z",
    });

    const stored = await getDriverLocation(redis, userId);

    expect(stored).toMatchObject({ lat: -3.73, lng: -38.52, heading: 90, speed: 12.5 });
    expect(stored?.updated_at).toEqual(expect.any(String));
  });

  it("returns null when there is no location stored", async () => {
    const redis = fakeRedis();
    const result = await getDriverLocation(redis, "no-such-user");
    expect(result).toBeNull();
  });
});
