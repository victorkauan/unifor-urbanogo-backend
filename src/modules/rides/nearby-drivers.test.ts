import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { findNearbyOnlineDrivers } from "./nearby-drivers.js";

function fakePrisma(rows: unknown[] = []): PrismaClient {
  return { $queryRaw: vi.fn().mockResolvedValue(rows) } as unknown as PrismaClient;
}

const origin = { lat: -3.73, lng: -38.52 };

describe("findNearbyOnlineDrivers input validation", () => {
  it("rejects an origin that is not a pair of finite numbers", async () => {
    await expect(
      findNearbyOnlineDrivers(fakePrisma(), { origin: { lat: Number.NaN, lng: 0 }, radiusKm: 5 }),
    ).rejects.toThrow(/finite/);
    await expect(
      findNearbyOnlineDrivers(fakePrisma(), {
        origin: { lat: 0, lng: Number.POSITIVE_INFINITY },
        radiusKm: 5,
      }),
    ).rejects.toThrow(/finite/);
  });

  it("rejects a radius that is not greater than zero", async () => {
    await expect(findNearbyOnlineDrivers(fakePrisma(), { origin, radiusKm: 0 })).rejects.toThrow(
      /radiusKm/,
    );
    await expect(findNearbyOnlineDrivers(fakePrisma(), { origin, radiusKm: -3 })).rejects.toThrow(
      /radiusKm/,
    );
  });

  it("rejects a limit that is not a positive integer", async () => {
    await expect(
      findNearbyOnlineDrivers(fakePrisma(), { origin, radiusKm: 5, limit: 0 }),
    ).rejects.toThrow(/limit/);
    await expect(
      findNearbyOnlineDrivers(fakePrisma(), { origin, radiusKm: 5, limit: 2.5 }),
    ).rejects.toThrow(/limit/);
  });

  it("runs the query and returns its rows for a valid request", async () => {
    const prisma = fakePrisma([{ driverId: "d1" }]);
    const result = await findNearbyOnlineDrivers(prisma, {
      origin,
      radiusKm: 5,
      serviceType: "ride",
    });

    expect(result).toEqual([{ driverId: "d1" }]);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
});
