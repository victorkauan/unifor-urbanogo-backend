import { Prisma, type PrismaClient } from "@prisma/client";

export interface RetentionLogger {
  info(obj: unknown, msg: string): void;
  error(obj: unknown, msg: string): void;
}

const TERMINAL_STATUSES = ["completed", "cancelled", "expired"] as const;

/**
 * Casas decimais mantidas na latitude/longitude de corridas antigas. 2 casas em
 * graus equivalem a ~1,1 km, suficiente para métricas de região sem apontar
 * origem e destino exatos de uma pessoa. Ver docs/operations/lgpd.md (grupo 3).
 */
const ANONYMIZED_COORDINATE_DECIMALS = 2;

const HOURS_IN_MS = 60 * 60 * 1000;
const DAYS_IN_MS = 24 * HOURS_IN_MS;

export interface AnonymizeRideLocationsOptions {
  olderThanDays: number;
  now?: Date;
}

/**
 * Arredonda as coordenadas e apaga os endereços das corridas já encerradas há
 * mais de `olderThanDays` dias, carimbando `location_anonymized_at` para não
 * reprocessar. Idempotente. Retorna quantas corridas foram anonimizadas.
 */
export async function anonymizeStaleRideLocations(
  prisma: PrismaClient,
  { olderThanDays, now = new Date() }: AnonymizeRideLocationsOptions,
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanDays * DAYS_IN_MS);
  const decimals = Prisma.raw(String(ANONYMIZED_COORDINATE_DECIMALS));

  return prisma.$executeRaw`
    UPDATE "rides" SET
      "origin_lat" = round("origin_lat"::numeric, ${decimals})::double precision,
      "origin_lng" = round("origin_lng"::numeric, ${decimals})::double precision,
      "dest_lat" = round("dest_lat"::numeric, ${decimals})::double precision,
      "dest_lng" = round("dest_lng"::numeric, ${decimals})::double precision,
      "origin_address" = NULL,
      "dest_address" = NULL,
      "location_anonymized_at" = ${now}
    WHERE "status"::text IN (${Prisma.join([...TERMINAL_STATUSES])})
      AND "location_anonymized_at" IS NULL
      AND "requested_at" < ${cutoff}
  `;
}

export interface PurgeDriverLocationsOptions {
  olderThanHours: number;
  now?: Date;
}

/**
 * Apaga as linhas de `driver_locations` (última posição por motorista) que não
 * são atualizadas há mais de `olderThanHours` horas, ou seja, de motoristas
 * offline. A posição corrente vive no Redis com TTL curto e não passa por aqui.
 * Retorna quantas linhas foram removidas.
 */
export async function purgeStaleDriverLocations(
  prisma: PrismaClient,
  { olderThanHours, now = new Date() }: PurgeDriverLocationsOptions,
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanHours * HOURS_IN_MS);

  return prisma.$executeRaw`
    DELETE FROM "driver_locations"
    WHERE "recorded_at" < ${cutoff}
  `;
}

export interface LocationRetentionConfig {
  rideLocationRetentionDays: number;
  driverLocationRetentionHours: number;
}

export interface LocationRetentionSweepResult {
  ridesAnonymized: number;
  driverLocationsPurged: number;
}

export interface RunLocationRetentionSweepOptions {
  prisma: PrismaClient;
  config: LocationRetentionConfig;
  logger: RetentionLogger;
  now?: Date;
}

/**
 * Passa uma vez pelas duas rotinas de retenção de localização e loga o resumo.
 * As operações são idempotentes, então rodar em paralelo em várias instâncias é
 * seguro, apenas redundante.
 */
export async function runLocationRetentionSweep({
  prisma,
  config,
  logger,
  now = new Date(),
}: RunLocationRetentionSweepOptions): Promise<LocationRetentionSweepResult> {
  const ridesAnonymized = await anonymizeStaleRideLocations(prisma, {
    olderThanDays: config.rideLocationRetentionDays,
    now,
  });
  const driverLocationsPurged = await purgeStaleDriverLocations(prisma, {
    olderThanHours: config.driverLocationRetentionHours,
    now,
  });

  const result = { ridesAnonymized, driverLocationsPurged };
  logger.info(result, "varredura de retenção de localização concluída");
  return result;
}
