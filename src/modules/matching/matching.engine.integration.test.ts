import { PrismaClient, type Prisma } from "@prisma/client";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "../../../test/db.js";
import { createTestUser } from "../../../test/fixtures.js";
import { AppError } from "../../lib/errors.js";
import { matchingQueueSize, matchingSearchDuration } from "../../lib/metrics.js";
import {
  MatchingEngine,
  type MatchingEngineDeps,
  type Scheduler,
  type TrustProvider,
} from "./matching.engine.js";
import type {
  MatchingNotifier,
  MatchingOfferPayload,
  RideStatusPayload,
} from "./matching.notifier.js";
import { getSearchState } from "./matching-state.repo.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

class ManualScheduler implements Scheduler {
  private tasks: { delayMs: number; fn: () => void | Promise<void>; active: boolean }[] = [];

  schedule(delayMs: number, fn: () => void | Promise<void>) {
    const task = { delayMs, fn, active: true };
    this.tasks.push(task);
    return {
      cancel: () => {
        task.active = false;
      },
    };
  }

  async fire(delayMs: number): Promise<void> {
    for (const task of this.tasks.filter((t) => t.active && t.delayMs === delayMs)) {
      task.active = false;
      await task.fn();
    }
  }

  activeCount(): number {
    return this.tasks.filter((t) => t.active).length;
  }
}

function createFakeNotifier() {
  const offers: { driverUserId: string; payload: MatchingOfferPayload }[] = [];
  const cancels: { rideId: string; reason: string }[] = [];
  const statuses: RideStatusPayload[] = [];
  const notifier: MatchingNotifier = {
    offerToDriver: (driverUserId, payload) => offers.push({ driverUserId, payload }),
    cancelToRide: (rideId, reason) => cancels.push({ rideId, reason }),
    statusToRide: (_rideId, payload) => statuses.push(payload),
  };
  return { notifier, offers, cancels, statuses };
}

const alwaysTrusted: TrustProvider = { getTrust: async () => 1 };

describe.runIf(shouldRun)("MatchingEngine", () => {
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

  afterEach(async () => {
    await redis.flushall();
  });

  async function onlineDriverAt(
    lat: number,
    lng: number,
    overrides: Partial<Prisma.DriverCreateInput> = {},
  ) {
    const user = await createTestUser(prisma, { role: "driver" });
    const driver = await prisma.driver.create({
      data: {
        user: { connect: { id: user.id } },
        servicePreference: "both",
        isOnline: true,
        vehicleModel: "Onix",
        vehiclePlate: "ABC1D23",
        ...overrides,
      },
    });
    await prisma.driverLocation.create({
      data: { driverId: driver.id, lat, lng, recordedAt: new Date() },
    });
    return { user, driver };
  }

  async function searchingRide(
    passengerId: string,
    overrides: Partial<Prisma.RideCreateInput> = {},
  ) {
    return prisma.ride.create({
      data: {
        passenger: { connect: { id: passengerId } },
        type: "ride",
        status: "searching",
        originLat: -3.7319,
        originLng: -38.5267,
        destLat: -3.75,
        destLng: -38.49,
        ...overrides,
      },
    });
  }

  function buildEngine(overrides: Partial<MatchingEngineDeps> = {}) {
    const scheduler = new ManualScheduler();
    const fake = createFakeNotifier();
    const engine = new MatchingEngine({
      prisma,
      redis,
      notifier: fake.notifier,
      trust: alwaysTrusted,
      scheduler,
      ...overrides,
    });
    return { engine, scheduler, ...fake };
  }

  it("offers to the closest driver first and assigns on accept", async () => {
    const passenger = await createTestUser(prisma);
    const near = await onlineDriverAt(-3.732, -38.527);
    await onlineDriverAt(-3.74, -38.54);
    const ride = await searchingRide(passenger.id);

    const { engine, offers, statuses } = buildEngine();
    const queueGaugeSpy = vi.spyOn(matchingQueueSize, "set");
    await engine.start(ride.id);

    expect(offers).toHaveLength(1);
    expect(offers[0]?.driverUserId).toBe(near.user.id);
    expect(offers[0]?.payload.ride_id).toBe(ride.id);
    expect(offers[0]?.payload.price_cents).toBeGreaterThan(0);
    expect(queueGaugeSpy).toHaveBeenLastCalledWith(1);

    const durationSpy = vi.spyOn(matchingSearchDuration, "observe");
    const offerId = offers[0]!.payload.offer_id;
    const updated = await engine.handleAccept(offerId, near.user.id);

    expect(updated.status).toBe("assigned");
    expect(updated.driverId).toBe(near.driver.id);
    expect(statuses.at(-1)?.status).toBe("assigned");
    expect(durationSpy).toHaveBeenCalledWith({ outcome: "assigned" }, expect.any(Number));
    expect(queueGaugeSpy).toHaveBeenLastCalledWith(0);

    const acceptedOffer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
    expect(acceptedOffer?.status).toBe("accepted");

    queueGaugeSpy.mockRestore();
    durationSpy.mockRestore();
  });

  it("moves to the next driver on rejection", async () => {
    const passenger = await createTestUser(prisma);
    const first = await onlineDriverAt(-3.732, -38.527);
    const second = await onlineDriverAt(-3.735, -38.53);
    const ride = await searchingRide(passenger.id);

    const { engine, offers } = buildEngine();
    await engine.start(ride.id);

    await engine.handleReject(offers[0]!.payload.offer_id, first.user.id);

    expect(offers).toHaveLength(2);
    expect(offers[1]?.driverUserId).toBe(second.user.id);
    const rejected = await prisma.rideOffer.findUnique({
      where: { id: offers[0]!.payload.offer_id },
    });
    expect(rejected?.status).toBe("rejected");
  });

  it("moves to the next driver when an offer times out", async () => {
    const passenger = await createTestUser(prisma);
    await onlineDriverAt(-3.732, -38.527);
    const second = await onlineDriverAt(-3.735, -38.53);
    const ride = await searchingRide(passenger.id);

    const { engine, scheduler, offers } = buildEngine();
    await engine.start(ride.id);

    await scheduler.fire(15_000);

    expect(offers).toHaveLength(2);
    expect(offers[1]?.driverUserId).toBe(second.user.id);
    const timedOut = await prisma.rideOffer.findUnique({
      where: { id: offers[0]!.payload.offer_id },
    });
    expect(timedOut?.status).toBe("timed_out");
  });

  it("cancels the search and expires the ride when the queue is exhausted", async () => {
    const passenger = await createTestUser(prisma);
    const only = await onlineDriverAt(-3.732, -38.527);
    const ride = await searchingRide(passenger.id);

    const { engine, offers, cancels } = buildEngine();
    await engine.start(ride.id);
    await engine.handleReject(offers[0]!.payload.offer_id, only.user.id);

    expect(cancels).toEqual([{ rideId: ride.id, reason: "drivers_exhausted" }]);
    const finalRide = await prisma.ride.findUnique({ where: { id: ride.id } });
    expect(finalRide?.status).toBe("expired");
  });

  it("cancels the search on the global timeout", async () => {
    const passenger = await createTestUser(prisma);
    await onlineDriverAt(-3.732, -38.527);
    await onlineDriverAt(-3.735, -38.53);
    const ride = await searchingRide(passenger.id);

    const { engine, scheduler, cancels, offers } = buildEngine();
    await engine.start(ride.id);
    await scheduler.fire(60_000);

    expect(cancels).toEqual([{ rideId: ride.id, reason: "timeout" }]);
    const finalRide = await prisma.ride.findUnique({ where: { id: ride.id } });
    expect(finalRide?.status).toBe("expired");
    const pendingOffer = await prisma.rideOffer.findUnique({
      where: { id: offers[0]!.payload.offer_id },
    });
    expect(pendingOffer?.status).toBe("timed_out");
  });

  it("cancels immediately when there is no online driver nearby", async () => {
    const passenger = await createTestUser(prisma);
    const ride = await searchingRide(passenger.id);

    const { engine, offers, cancels } = buildEngine();
    await engine.start(ride.id);

    expect(offers).toHaveLength(0);
    expect(cancels).toEqual([{ rideId: ride.id, reason: "no_drivers_available" }]);
    const finalRide = await prisma.ride.findUnique({ where: { id: ride.id } });
    expect(finalRide?.status).toBe("expired");
  });

  it("ranks a more trusted driver ahead of a slightly closer one", async () => {
    const passenger = await createTestUser(prisma);
    const closer = await onlineDriverAt(-3.7325, -38.5272);
    const trusted = await onlineDriverAt(-3.734, -38.529);
    const ride = await searchingRide(passenger.id);

    const trust: TrustProvider = {
      getTrust: async (userId) => (userId === trusted.user.id ? 1 : 0.05),
    };
    const { engine, offers } = buildEngine({ trust });
    await engine.start(ride.id);

    expect(offers[0]?.driverUserId).toBe(trusted.user.id);
    void closer;
  });

  it("rejects an accept from a driver who does not own the offer", async () => {
    const passenger = await createTestUser(prisma);
    const driver = await onlineDriverAt(-3.732, -38.527);
    const intruder = await createTestUser(prisma, { role: "driver" });
    const ride = await searchingRide(passenger.id);

    const { engine, offers } = buildEngine();
    await engine.start(ride.id);

    await expect(
      engine.handleAccept(offers[0]!.payload.offer_id, intruder.id),
    ).rejects.toBeInstanceOf(AppError);
    void driver;
  });

  it("rejects an accept for an offer that already timed out", async () => {
    const passenger = await createTestUser(prisma);
    const driver = await onlineDriverAt(-3.732, -38.527);
    await onlineDriverAt(-3.735, -38.53);
    const ride = await searchingRide(passenger.id);

    const { engine, scheduler, offers } = buildEngine();
    await engine.start(ride.id);
    const firstOfferId = offers[0]!.payload.offer_id;
    await scheduler.fire(15_000);

    await expect(engine.handleAccept(firstOfferId, driver.user.id)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("refuses to start a search for a ride that is not searching", async () => {
    const passenger = await createTestUser(prisma);
    await onlineDriverAt(-3.732, -38.527);
    const ride = await searchingRide(passenger.id, { status: "assigned" });

    const { engine } = buildEngine();
    await expect(engine.start(ride.id)).rejects.toBeInstanceOf(AppError);
  });

  it("keeps the search state in Redis while searching", async () => {
    const passenger = await createTestUser(prisma);
    await onlineDriverAt(-3.732, -38.527);
    const ride = await searchingRide(passenger.id);

    const { engine } = buildEngine();
    await engine.start(ride.id);

    const state = await getSearchState(redis, ride.id);
    expect(state?.status).toBe("searching");
    expect(state?.queue).toHaveLength(1);
    expect(state?.currentIndex).toBe(0);
  });

  it("skips a driver who already has a pending offer or an active ride", async () => {
    const passenger = await createTestUser(prisma);
    const other = await createTestUser(prisma);
    const busyPending = await onlineDriverAt(-3.732, -38.527);
    const busyAssigned = await onlineDriverAt(-3.733, -38.528);
    const free = await onlineDriverAt(-3.736, -38.531);

    const pendingRide = await searchingRide(other.id);
    await prisma.rideOffer.create({
      data: {
        rideId: pendingRide.id,
        driverId: busyPending.driver.id,
        position: 0,
        status: "pending",
        offeredAt: new Date(),
        expiresAt: new Date(Date.now() + 15_000),
      },
    });
    await prisma.ride.create({
      data: {
        passengerId: other.id,
        driverId: busyAssigned.driver.id,
        type: "ride",
        status: "in_progress",
        originLat: -3.73,
        originLng: -38.52,
        destLat: -3.75,
        destLng: -38.49,
      },
    });

    const ride = await searchingRide(passenger.id);
    const { engine, offers } = buildEngine();
    await engine.start(ride.id);

    expect(offers).toHaveLength(1);
    expect(offers[0]?.driverUserId).toBe(free.user.id);
  });

  it("cancel() stops the search and records who cancelled", async () => {
    const passenger = await createTestUser(prisma);
    await onlineDriverAt(-3.732, -38.527);
    const ride = await searchingRide(passenger.id);

    const { engine, scheduler, cancels } = buildEngine();
    const durationSpy = vi.spyOn(matchingSearchDuration, "observe");
    await engine.start(ride.id);
    await engine.cancel(ride.id, "passenger");

    expect(durationSpy).toHaveBeenCalledWith({ outcome: "cancelled" }, expect.any(Number));
    durationSpy.mockRestore();

    const finalRide = await prisma.ride.findUnique({ where: { id: ride.id } });
    expect(finalRide?.status).toBe("cancelled");
    expect(finalRide?.cancelledBy).toBe("passenger");
    expect(finalRide?.cancelledAt).not.toBeNull();
    expect(cancels).toEqual([{ rideId: ride.id, reason: "cancelled" }]);
    expect(scheduler.activeCount()).toBe(0);
  });
});
