import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

/**
 * Grade simples (2 casas decimais ≈ 1.1km por célula em Fortaleza), em vez de
 * geohash: sem extensão geoespacial no Postgres já é a decisão do ADR 0001,
 * e aqui nem toca banco - é só uma chave de agrupamento pro Redis.
 */
const GRID_PRECISION = 2;

/**
 * Um pouco maior que o intervalo de envio do driver:location (5s, ADR 0002),
 * pra tolerar jitter sem contar um motorista como offline cedo demais.
 */
export const DRIVER_PRESENCE_WINDOW_MS = 20_000;

/** Janela deslizante de "pedidos recentes" usada como sinal de demanda. */
export const REQUEST_DEMAND_WINDOW_MS = 10 * 60_000;

/** Proporção usada quando há pedidos mas nenhum motorista online na célula. */
const DEMAND_RATIO_NO_DRIVERS = 3;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function gridCell(point: GeoPoint, precision = GRID_PRECISION): string {
  return `${point.lat.toFixed(precision)}:${point.lng.toFixed(precision)}`;
}

function driversKey(cell: string): string {
  return `demand:drivers:${cell}`;
}

function requestsKey(cell: string): string {
  return `demand:requests:${cell}`;
}

async function recordPresence(
  redis: Redis,
  key: string,
  member: string,
  windowMs: number,
  now: number,
): Promise<void> {
  await redis.zadd(key, now, member);
  await redis.zremrangebyscore(key, 0, now - windowMs);
  await redis.expire(key, Math.ceil(windowMs / 1000));
}

async function countRecent(
  redis: Redis,
  key: string,
  windowMs: number,
  now: number,
): Promise<number> {
  await redis.zremrangebyscore(key, 0, now - windowMs);
  return redis.zcount(key, now - windowMs, now);
}

export async function recordDriverPresence(
  redis: Redis,
  driverUserId: string,
  point: GeoPoint,
  now: number = Date.now(),
): Promise<void> {
  await recordPresence(
    redis,
    driversKey(gridCell(point)),
    driverUserId,
    DRIVER_PRESENCE_WINDOW_MS,
    now,
  );
}

export async function recordRideRequest(
  redis: Redis,
  point: GeoPoint,
  now: number = Date.now(),
): Promise<void> {
  await recordPresence(
    redis,
    requestsKey(gridCell(point)),
    randomUUID(),
    REQUEST_DEMAND_WINDOW_MS,
    now,
  );
}

/**
 * Proporção de pedidos recentes por motorista online na célula da origem.
 * `undefined` quando não há pedidos recentes (sinal neutro pro PRC-2).
 */
export async function getDemandRatio(
  redis: Redis,
  point: GeoPoint,
  now: number = Date.now(),
): Promise<number | undefined> {
  const cell = gridCell(point);
  const [drivers, requests] = await Promise.all([
    countRecent(redis, driversKey(cell), DRIVER_PRESENCE_WINDOW_MS, now),
    countRecent(redis, requestsKey(cell), REQUEST_DEMAND_WINDOW_MS, now),
  ]);

  if (requests === 0) {
    return undefined;
  }
  return drivers === 0 ? DEMAND_RATIO_NO_DRIVERS : requests / drivers;
}
