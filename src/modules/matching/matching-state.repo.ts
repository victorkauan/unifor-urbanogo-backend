import type { Redis } from "ioredis";

export type MatchingSearchStatus = "searching" | "assigned" | "cancelled" | "expired";

export interface MatchingQueueEntry {
  driverId: string;
  userId: string;
  distanceKm: number;
  trust: number;
}

export interface MatchingSearchState {
  rideId: string;
  status: MatchingSearchStatus;
  startedAt: string;
  deadlineAt: string;
  queue: MatchingQueueEntry[];
  currentIndex: number;
  currentOfferId: string | null;
}

export function matchingStateKey(rideId: string): string {
  return `matching:ride:${rideId}`;
}

export async function saveSearchState(
  redis: Redis,
  state: MatchingSearchState,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(matchingStateKey(state.rideId), JSON.stringify(state), "EX", ttlSeconds);
}

export async function getSearchState(
  redis: Redis,
  rideId: string,
): Promise<MatchingSearchState | null> {
  const raw = await redis.get(matchingStateKey(rideId));
  return raw ? (JSON.parse(raw) as MatchingSearchState) : null;
}

export async function clearSearchState(redis: Redis, rideId: string): Promise<void> {
  await redis.del(matchingStateKey(rideId));
}
