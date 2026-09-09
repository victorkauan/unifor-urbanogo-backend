import { PrismaClient, type ServicePreference } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { findNearbyOnlineDrivers } from "./nearby-drivers.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("findNearbyOnlineDrivers (database)", () => {
  const prisma = new PrismaClient();
  const runId = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  interface MakeDriverOptions {
    key: string;
    lat: number;
    lng: number;
    isOnline?: boolean;
    servicePreference?: ServicePreference;
    deleted?: boolean;
  }

  async function makeDriver(options: MakeDriverOptions): Promise<string> {
    const user = await prisma.user.create({
      data: {
        name: `Nearby ${options.key}`,
        email: `nearby-${options.key}-${runId}@test.local`,
        passwordHash: "not-a-real-hash",
        role: "driver",
      },
    });
    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        servicePreference: options.servicePreference ?? "both",
        isOnline: options.isOnline ?? true,
        deletedAt: options.deleted ? new Date() : null,
      },
    });
    await prisma.driverLocation.create({
      data: { driverId: driver.id, lat: options.lat, lng: options.lng, recordedAt: new Date() },
    });
    return driver.id;
  }

  async function cleanup(): Promise<void> {
    const where = { driver: { user: { email: { contains: runId } } } };
    await prisma.driverLocation.deleteMany({ where });
    await prisma.driver.deleteMany({ where: { user: { email: { contains: runId } } } });
    await prisma.user.deleteMany({ where: { email: { contains: runId } } });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns online drivers inside the radius ordered by distance", async () => {
    const near = await makeDriver({ key: "near", lat: 0, lng: 0.01 });
    const mid = await makeDriver({ key: "mid", lat: 0, lng: 0.05 });
    await makeDriver({ key: "far", lat: 0, lng: 0.2 });
    await makeDriver({ key: "offline", lat: 0, lng: 0.02, isOnline: false });
    await makeDriver({ key: "deleted", lat: 0, lng: 0.03, deleted: true });

    const result = await findNearbyOnlineDrivers(prisma, {
      origin: { lat: 0, lng: 0 },
      radiusKm: 10,
    });

    expect(result.map((row) => row.driverId)).toEqual([near, mid]);
    expect(result[0].distanceKm).toBeGreaterThan(0);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    expect(result[0].distanceKm).toBeCloseTo(1.11, 1);
  });

  it("filters by the service type when given", async () => {
    const ridesDriver = await makeDriver({
      key: "rides",
      lat: 0,
      lng: 0.01,
      servicePreference: "rides",
    });
    const bothDriver = await makeDriver({
      key: "both",
      lat: 0,
      lng: 0.015,
      servicePreference: "both",
    });
    await makeDriver({
      key: "deliveries",
      lat: 0,
      lng: 0.012,
      servicePreference: "deliveries",
    });

    const result = await findNearbyOnlineDrivers(prisma, {
      origin: { lat: 0, lng: 0 },
      radiusKm: 10,
      serviceType: "ride",
    });

    expect(result.map((row) => row.driverId).sort()).toEqual([ridesDriver, bothDriver].sort());
  });

  it("caps the result set at the requested limit", async () => {
    const closest = await makeDriver({ key: "a", lat: 0, lng: 0.01 });
    const second = await makeDriver({ key: "b", lat: 0, lng: 0.02 });
    await makeDriver({ key: "c", lat: 0, lng: 0.03 });

    const result = await findNearbyOnlineDrivers(prisma, {
      origin: { lat: 0, lng: 0 },
      radiusKm: 10,
      limit: 2,
    });

    expect(result.map((row) => row.driverId)).toEqual([closest, second]);
  });
});
