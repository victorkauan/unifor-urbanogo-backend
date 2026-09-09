import { RideStatus } from "@prisma/client";
import { ConflictError } from "../../lib/errors.js";

export const RIDE_STATUS_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  [RideStatus.requested]: [RideStatus.searching, RideStatus.cancelled, RideStatus.expired],
  [RideStatus.searching]: [RideStatus.assigned, RideStatus.cancelled, RideStatus.expired],
  [RideStatus.assigned]: [RideStatus.in_progress, RideStatus.cancelled],
  [RideStatus.in_progress]: [RideStatus.completed, RideStatus.cancelled],
  [RideStatus.completed]: [],
  [RideStatus.cancelled]: [],
  [RideStatus.expired]: [],
};

const RIDE_STATUS_TIMESTAMP_FIELD: Partial<Record<RideStatus, string>> = {
  [RideStatus.assigned]: "assignedAt",
  [RideStatus.in_progress]: "startedAt",
  [RideStatus.completed]: "completedAt",
  [RideStatus.cancelled]: "cancelledAt",
};

export function nextRideStatuses(from: RideStatus): readonly RideStatus[] {
  return RIDE_STATUS_TRANSITIONS[from];
}

export function isTerminalRideStatus(status: RideStatus): boolean {
  return RIDE_STATUS_TRANSITIONS[status].length === 0;
}

export function canTransitionRide(from: RideStatus, to: RideStatus): boolean {
  return RIDE_STATUS_TRANSITIONS[from].includes(to);
}

export function assertRideTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransitionRide(from, to)) {
    throw new ConflictError(`Não é possível mudar a corrida de "${from}" para "${to}"`, {
      from,
      to,
      allowed: RIDE_STATUS_TRANSITIONS[from],
    });
  }
}

export function rideStatusTimestampField(status: RideStatus): string | null {
  return RIDE_STATUS_TIMESTAMP_FIELD[status] ?? null;
}
