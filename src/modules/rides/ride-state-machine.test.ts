import { RideStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors.js";
import {
  RIDE_STATUS_TRANSITIONS,
  assertRideTransition,
  canTransitionRide,
  isTerminalRideStatus,
  nextRideStatuses,
  rideStatusTimestampField,
} from "./ride-state-machine.js";

const ALL_STATUSES = Object.values(RideStatus);

const VALID_TRANSITIONS: ReadonlyArray<[RideStatus, RideStatus]> = [
  [RideStatus.requested, RideStatus.searching],
  [RideStatus.requested, RideStatus.cancelled],
  [RideStatus.requested, RideStatus.expired],
  [RideStatus.searching, RideStatus.assigned],
  [RideStatus.searching, RideStatus.cancelled],
  [RideStatus.searching, RideStatus.expired],
  [RideStatus.assigned, RideStatus.in_progress],
  [RideStatus.assigned, RideStatus.cancelled],
  [RideStatus.in_progress, RideStatus.completed],
  [RideStatus.in_progress, RideStatus.cancelled],
];

const isValid = (from: RideStatus, to: RideStatus) =>
  VALID_TRANSITIONS.some(([f, t]) => f === from && t === to);

describe("canTransitionRide", () => {
  it("accepts every listed valid transition", () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(canTransitionRide(from, to)).toBe(true);
    }
  });

  it("matches the transition table for every status pair", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(canTransitionRide(from, to)).toBe(isValid(from, to));
      }
    }
  });

  it("rejects staying in the same status", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionRide(status, status)).toBe(false);
    }
  });

  it("rejects any transition out of a terminal status", () => {
    for (const terminal of [RideStatus.completed, RideStatus.cancelled, RideStatus.expired]) {
      for (const to of ALL_STATUSES) {
        expect(canTransitionRide(terminal, to)).toBe(false);
      }
    }
  });

  it("rejects skipping the search phase", () => {
    expect(canTransitionRide(RideStatus.requested, RideStatus.assigned)).toBe(false);
    expect(canTransitionRide(RideStatus.requested, RideStatus.in_progress)).toBe(false);
    expect(canTransitionRide(RideStatus.searching, RideStatus.in_progress)).toBe(false);
  });
});

describe("assertRideTransition", () => {
  it("does not throw for a valid transition", () => {
    expect(() => assertRideTransition(RideStatus.searching, RideStatus.assigned)).not.toThrow();
  });

  it("throws a 409 AppError with a clear message and the allowed transitions", () => {
    try {
      assertRideTransition(RideStatus.assigned, RideStatus.searching);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode).toBe(409);
      expect(appError.message).toContain("assigned");
      expect(appError.message).toContain("searching");
      expect(appError.data).toEqual({
        from: RideStatus.assigned,
        to: RideStatus.searching,
        allowed: [RideStatus.in_progress, RideStatus.cancelled],
      });
    }
  });
});

describe("nextRideStatuses", () => {
  it("returns the configured targets for a status", () => {
    expect(nextRideStatuses(RideStatus.searching)).toEqual([
      RideStatus.assigned,
      RideStatus.cancelled,
      RideStatus.expired,
    ]);
  });

  it("returns an empty list for terminal statuses", () => {
    expect(nextRideStatuses(RideStatus.completed)).toEqual([]);
  });
});

describe("isTerminalRideStatus", () => {
  it("is true only for completed, cancelled and expired", () => {
    for (const status of ALL_STATUSES) {
      const terminal =
        status === RideStatus.completed ||
        status === RideStatus.cancelled ||
        status === RideStatus.expired;
      expect(isTerminalRideStatus(status)).toBe(terminal);
    }
  });
});

describe("rideStatusTimestampField", () => {
  it("maps lifecycle statuses to their timestamp column", () => {
    expect(rideStatusTimestampField(RideStatus.assigned)).toBe("assignedAt");
    expect(rideStatusTimestampField(RideStatus.in_progress)).toBe("startedAt");
    expect(rideStatusTimestampField(RideStatus.completed)).toBe("completedAt");
    expect(rideStatusTimestampField(RideStatus.cancelled)).toBe("cancelledAt");
  });

  it("returns null for statuses without a dedicated timestamp", () => {
    expect(rideStatusTimestampField(RideStatus.requested)).toBeNull();
    expect(rideStatusTimestampField(RideStatus.searching)).toBeNull();
    expect(rideStatusTimestampField(RideStatus.expired)).toBeNull();
  });
});

describe("RIDE_STATUS_TRANSITIONS", () => {
  it("covers every ride status as a key", () => {
    expect(Object.keys(RIDE_STATUS_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("only points to known statuses", () => {
    for (const targets of Object.values(RIDE_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });
});
