import type { Redis } from "ioredis";
import type { DriverLocationEvent } from "./realtime.schema.js";

/**
 * 3x o intervalo de envio decidido no ADR 0002 (5s), tolera 1-2 atualizações
 * perdidas antes de considerar o motorista offline para quem consome esta chave.
 */
export const DRIVER_LOCATION_TTL_SECONDS = 15;

export interface StoredDriverLocation extends DriverLocationEvent {
  updated_at: string;
}

export function driverLocationKey(userId: string): string {
  return `driver:${userId}:location`;
}

export async function saveDriverLocation(
  redis: Redis,
  userId: string,
  location: DriverLocationEvent,
): Promise<void> {
  const record: StoredDriverLocation = { ...location, updated_at: new Date().toISOString() };
  await redis.set(
    driverLocationKey(userId),
    JSON.stringify(record),
    "EX",
    DRIVER_LOCATION_TTL_SECONDS,
  );
}

export async function getDriverLocation(
  redis: Redis,
  userId: string,
): Promise<StoredDriverLocation | null> {
  const raw = await redis.get(driverLocationKey(userId));
  return raw ? (JSON.parse(raw) as StoredDriverLocation) : null;
}
