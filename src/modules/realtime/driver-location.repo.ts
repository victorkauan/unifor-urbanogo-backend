import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { DriverLocationEvent } from "./realtime.schema.js";

/**
 * 3x o intervalo de envio decidido no ADR 0005 (5s), tolera 1-2 atualizações
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

/**
 * O motor de matching (findNearbyOnlineDrivers, RIDE-3) busca motoristas só
 * no Postgres (driver_locations), não no Redis - sem isso, um motorista que
 * só manda driver:location pelo socket nunca fica descobrível pra matching
 * de verdade, só serve pro canal de tempo real (RT-4).
 *
 * Não-op silencioso se o usuário não tiver perfil de motorista: qualquer
 * usuário autenticado pode mandar driver:location hoje (URB-24 não valida
 * papel), então isso é esperado, não um erro.
 */
export async function upsertDriverLocation(
  prisma: PrismaClient,
  userId: string,
  location: DriverLocationEvent,
): Promise<void> {
  const driver = await prisma.driver.findUnique({ where: { userId }, select: { id: true } });
  if (!driver) {
    return;
  }

  const data = {
    lat: location.lat,
    lng: location.lng,
    heading: location.heading ?? null,
    speed: location.speed ?? null,
    accuracy: location.accuracy ?? null,
    recordedAt: new Date(location.recorded_at),
  };

  await prisma.driverLocation.upsert({
    where: { driverId: driver.id },
    create: { driverId: driver.id, ...data },
    update: data,
  });
}
