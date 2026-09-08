import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPositionTracker, projectPosition, type PositionTracker } from "./position-tracker.js";
import { rideRoom } from "./realtime.gateway.js";
import type { DriverLocationEvent } from "./realtime.schema.js";

function fakeIo() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { io: { to } as unknown as Parameters<typeof createPositionTracker>[0], to, emit };
}

function fakePrisma(activeRideId: string | null) {
  const findFirst = vi.fn().mockResolvedValue(activeRideId ? { id: activeRideId } : null);
  return { ride: { findFirst } } as unknown as PrismaClient;
}

function fakeLog(): FastifyBaseLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as unknown as FastifyBaseLogger;
}

const baseLocation: DriverLocationEvent = {
  lat: -3.73,
  lng: -38.52,
  heading: 90,
  speed: 10,
  recorded_at: "2026-09-08T12:00:00.000Z",
};

describe("position tracker", () => {
  let tracker: PositionTracker | undefined;

  afterEach(() => {
    tracker?.stop();
  });

  it("does nothing when the driver has no active ride", async () => {
    const { io, to } = fakeIo();
    tracker = createPositionTracker(io, fakePrisma(null), fakeLog());

    await tracker.handleDriverLocation({ userId: "driver-1", location: baseLocation });

    expect(to).not.toHaveBeenCalled();
  });

  it("broadcasts a real reading as predicted:false to the ride room", async () => {
    const rideId = "ride-1";
    const { io, to, emit } = fakeIo();
    tracker = createPositionTracker(io, fakePrisma(rideId), fakeLog());

    await tracker.handleDriverLocation({ userId: "driver-1", location: baseLocation });

    expect(to).toHaveBeenCalledWith(rideRoom(rideId));
    expect(emit).toHaveBeenCalledWith(
      "ride:driver_location",
      expect.objectContaining({ ride_id: rideId, lat: baseLocation.lat, lng: baseLocation.lng, predicted: false }),
    );
  });

  it("throttles a second real reading that arrives within the server window", async () => {
    const rideId = "ride-1";
    const { io, emit } = fakeIo();
    tracker = createPositionTracker(io, fakePrisma(rideId), fakeLog(), { throttleMs: 100_000 });

    await tracker.handleDriverLocation({ userId: "driver-1", location: baseLocation });
    await tracker.handleDriverLocation({ userId: "driver-1", location: baseLocation });

    const realBroadcasts = emit.mock.calls.filter(([, payload]) => payload.predicted === false);
    expect(realBroadcasts).toHaveLength(1);
  });

  it("schedules a dead-reckoning follow-up broadcast as predicted:true", async () => {
    const rideId = "ride-1";
    const { io, emit } = fakeIo();
    tracker = createPositionTracker(io, fakePrisma(rideId), fakeLog(), { predictedDelayMs: 20 });

    await tracker.handleDriverLocation({ userId: "driver-1", location: baseLocation });
    await new Promise((resolve) => setTimeout(resolve, 60));

    const predicted = emit.mock.calls.find(([, payload]) => payload.predicted === true);
    expect(predicted).toBeDefined();
    // heading 90° (leste): a projeção move a longitude, não a latitude
    const payload = predicted?.[1] as { lat: number; lng: number };
    expect(payload.lng).not.toBe(baseLocation.lng);
  });

  it("does not schedule a follow-up without heading/speed", async () => {
    const rideId = "ride-1";
    const { io, emit } = fakeIo();
    tracker = createPositionTracker(io, fakePrisma(rideId), fakeLog(), { predictedDelayMs: 20 });

    await tracker.handleDriverLocation({
      userId: "driver-1",
      location: { lat: baseLocation.lat, lng: baseLocation.lng, recorded_at: baseLocation.recorded_at },
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    const predicted = emit.mock.calls.find(([, payload]) => payload.predicted === true);
    expect(predicted).toBeUndefined();
  });

  it("stop() cancels pending dead-reckoning timeouts", async () => {
    const rideId = "ride-1";
    const { io, emit } = fakeIo();
    tracker = createPositionTracker(io, fakePrisma(rideId), fakeLog(), { predictedDelayMs: 20 });

    await tracker.handleDriverLocation({ userId: "driver-1", location: baseLocation });
    tracker.stop();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const predicted = emit.mock.calls.find(([, payload]) => payload.predicted === true);
    expect(predicted).toBeUndefined();
  });
});

describe("projectPosition", () => {
  it("moves the point roughly in the given heading over the elapsed time", () => {
    const result = projectPosition({ lat: 0, lng: 0, heading: 90, speed: 10 }, 10);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeGreaterThan(0);
  });

  it("does not move when speed is not provided", () => {
    const result = projectPosition({ lat: -3.73, lng: -38.52, heading: 90 }, 10);
    expect(result.lat).toBeCloseTo(-3.73, 6);
    expect(result.lng).toBeCloseTo(-38.52, 6);
  });
});
