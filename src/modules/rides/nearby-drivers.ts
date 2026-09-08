import { Prisma, type PrismaClient, type RideType, type ServicePreference } from "@prisma/client";
import { boundingBox, type LatLng } from "../../lib/geo.js";

export interface NearbyDriverQuery {
  origin: LatLng;
  radiusKm: number;
  limit?: number;
  serviceType?: RideType;
}

export interface NearbyDriver {
  driverId: string;
  userId: string;
  servicePreference: ServicePreference;
  lat: number;
  lng: number;
  distanceKm: number;
  recordedAt: Date;
}

const DEFAULT_LIMIT = 20;

const SERVICE_PREFERENCE_BY_RIDE_TYPE: Record<RideType, ServicePreference> = {
  ride: "rides",
  delivery: "deliveries",
};

export async function findNearbyOnlineDrivers(
  prisma: PrismaClient,
  query: NearbyDriverQuery,
): Promise<NearbyDriver[]> {
  const { origin, radiusKm } = query;
  const limit = query.limit ?? DEFAULT_LIMIT;

  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    throw new Error("origin lat and lng must be finite numbers");
  }
  if (!(radiusKm > 0)) {
    throw new Error("radiusKm must be greater than zero");
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }

  const box = boundingBox(origin, radiusKm);

  const distanceKm = Prisma.sql`
    2 * 6371 * asin(sqrt(
      power(sin(radians(dl.lat - ${origin.lat}) / 2), 2)
      + power(sin(radians(dl.lng - ${origin.lng}) / 2), 2)
        * cos(radians(${origin.lat})) * cos(radians(dl.lat))
    ))`;

  const serviceFilter =
    query.serviceType === undefined
      ? Prisma.empty
      : Prisma.sql`AND d.service_preference::text IN (${SERVICE_PREFERENCE_BY_RIDE_TYPE[query.serviceType]}, 'both')`;

  return prisma.$queryRaw<NearbyDriver[]>(Prisma.sql`
    SELECT
      d.id AS "driverId",
      d.user_id AS "userId",
      d.service_preference AS "servicePreference",
      dl.lat AS "lat",
      dl.lng AS "lng",
      dl.recorded_at AS "recordedAt",
      ${distanceKm} AS "distanceKm"
    FROM driver_locations dl
    JOIN drivers d ON d.id = dl.driver_id
    WHERE d.is_online = true
      AND d.deleted_at IS NULL
      AND dl.lat BETWEEN ${box.minLat} AND ${box.maxLat}
      AND dl.lng BETWEEN ${box.minLng} AND ${box.maxLng}
      ${serviceFilter}
      AND ${distanceKm} <= ${radiusKm}
    ORDER BY "distanceKm" ASC
    LIMIT ${limit}
  `);
}
