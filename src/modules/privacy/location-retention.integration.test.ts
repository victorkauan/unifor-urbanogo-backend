import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { anonymizeStaleRideLocations, purgeStaleDriverLocations } from "./location-retention.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("location retention (database)", () => {
  const prisma = new PrismaClient();
  const runId = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const PRECISE = {
    originLat: -3.731912,
    originLng: -38.526718,
    destLat: -3.744219,
    destLng: -38.487654,
  };

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  function hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  async function makePassengerId(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        name: "Retention Passenger",
        email: `retention-p-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`,
        passwordHash: "not-a-real-hash",
        role: "passenger",
      },
    });
    return user.id;
  }

  interface MakeRideOptions {
    status?: "completed" | "cancelled" | "expired" | "in_progress";
    requestedAt: Date;
  }

  async function makeRide({ status = "completed", requestedAt }: MakeRideOptions): Promise<string> {
    const passengerId = await makePassengerId();
    const ride = await prisma.ride.create({
      data: {
        passengerId,
        type: "ride",
        status,
        originLat: PRECISE.originLat,
        originLng: PRECISE.originLng,
        originAddress: "Rua A, 123",
        destLat: PRECISE.destLat,
        destLng: PRECISE.destLng,
        destAddress: "Rua B, 456",
        requestedAt,
      },
    });
    return ride.id;
  }

  async function makeDriverLocation(recordedAt: Date): Promise<string> {
    const user = await prisma.user.create({
      data: {
        name: "Retention Driver",
        email: `retention-d-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`,
        passwordHash: "not-a-real-hash",
        role: "driver",
      },
    });
    const driver = await prisma.driver.create({
      data: { userId: user.id, servicePreference: "both" },
    });
    await prisma.driverLocation.create({
      data: { driverId: driver.id, lat: PRECISE.originLat, lng: PRECISE.originLng, recordedAt },
    });
    return driver.id;
  }

  async function cleanup(): Promise<void> {
    const emailLike = { contains: runId };
    await prisma.driverLocation.deleteMany({
      where: { driver: { user: { email: emailLike } } },
    });
    await prisma.ride.deleteMany({ where: { passenger: { email: emailLike } } });
    await prisma.driver.deleteMany({ where: { user: { email: emailLike } } });
    await prisma.user.deleteMany({ where: { email: emailLike } });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(cleanup);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rounds coordinates and clears addresses of old terminal rides", async () => {
    const oldRideId = await makeRide({ status: "completed", requestedAt: daysAgo(100) });

    const affected = await anonymizeStaleRideLocations(prisma, { olderThanDays: 90 });
    expect(affected).toBe(1);

    const ride = await prisma.ride.findUniqueOrThrow({ where: { id: oldRideId } });
    expect(ride.originLat).toBeCloseTo(-3.73, 6);
    expect(ride.originLng).toBeCloseTo(-38.53, 6);
    expect(ride.destLat).toBeCloseTo(-3.74, 6);
    expect(ride.destLng).toBeCloseTo(-38.49, 6);
    expect(ride.originAddress).toBeNull();
    expect(ride.destAddress).toBeNull();
    expect(ride.locationAnonymizedAt).toBeInstanceOf(Date);
  });

  it("leaves recent rides and non-terminal rides untouched", async () => {
    const recentId = await makeRide({ status: "completed", requestedAt: daysAgo(10) });
    const activeId = await makeRide({ status: "in_progress", requestedAt: daysAgo(100) });

    const affected = await anonymizeStaleRideLocations(prisma, { olderThanDays: 90 });
    expect(affected).toBe(0);

    for (const id of [recentId, activeId]) {
      const ride = await prisma.ride.findUniqueOrThrow({ where: { id } });
      expect(ride.originLat).toBe(PRECISE.originLat);
      expect(ride.originAddress).toBe("Rua A, 123");
      expect(ride.locationAnonymizedAt).toBeNull();
    }
  });

  it("does not reprocess an already anonymized ride", async () => {
    await makeRide({ status: "cancelled", requestedAt: daysAgo(100) });

    expect(await anonymizeStaleRideLocations(prisma, { olderThanDays: 90 })).toBe(1);
    expect(await anonymizeStaleRideLocations(prisma, { olderThanDays: 90 })).toBe(0);
  });

  it("purges driver_locations rows older than the cutoff", async () => {
    const staleDriverId = await makeDriverLocation(hoursAgo(48));
    const freshDriverId = await makeDriverLocation(hoursAgo(1));

    const removed = await purgeStaleDriverLocations(prisma, { olderThanHours: 24 });
    expect(removed).toBe(1);

    expect(
      await prisma.driverLocation.findUnique({ where: { driverId: staleDriverId } }),
    ).toBeNull();
    expect(
      await prisma.driverLocation.findUnique({ where: { driverId: freshDriverId } }),
    ).not.toBeNull();
  });
});
