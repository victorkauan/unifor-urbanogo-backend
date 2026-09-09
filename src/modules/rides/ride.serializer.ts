import { Prisma } from "@prisma/client";

export const rideResponseInclude = {
  passenger: { select: { id: true, name: true } },
  driver: {
    select: {
      id: true,
      userId: true,
      vehicleModel: true,
      vehiclePlate: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.RideInclude;

export type RideForResponse = Prisma.RideGetPayload<{ include: typeof rideResponseInclude }>;

export interface SerializeRideOptions {
  driverTrustScore?: number | null;
}

export function serializeRide(ride: RideForResponse, options: SerializeRideOptions = {}) {
  return {
    id: ride.id,
    type: ride.type,
    status: ride.status,
    passenger: { id: ride.passenger.id, name: ride.passenger.name },
    driver: ride.driver
      ? {
          id: ride.driver.id,
          name: ride.driver.user.name,
          vehicle_model: ride.driver.vehicleModel,
          vehicle_plate: ride.driver.vehiclePlate,
          trust_score: options.driverTrustScore ?? null,
        }
      : null,
    origin: { lat: ride.originLat, lng: ride.originLng, address: ride.originAddress },
    destination: { lat: ride.destLat, lng: ride.destLng, address: ride.destAddress },
    distance_meters: ride.distanceMeters,
    price_cents: ride.priceCents,
    currency: "BRL",
    price_breakdown: ride.priceBreakdown ?? null,
    requested_at: ride.requestedAt.toISOString(),
    assigned_at: ride.assignedAt?.toISOString() ?? null,
    started_at: ride.startedAt?.toISOString() ?? null,
    completed_at: ride.completedAt?.toISOString() ?? null,
    cancelled_at: ride.cancelledAt?.toISOString() ?? null,
    cancelled_by: ride.cancelledBy ?? null,
  };
}
