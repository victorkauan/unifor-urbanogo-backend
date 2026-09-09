import { describe, expect, it } from "vitest";
import { serializeRide, type RideForResponse } from "./ride.serializer.js";

const baseRide = {
  id: "ride-1",
  type: "ride",
  status: "searching",
  passenger: { id: "user-1", name: "John Doe" },
  driver: null,
  originLat: -3.73,
  originLng: -38.52,
  originAddress: "Rua das Flores, 100",
  destLat: -3.75,
  destLng: -38.49,
  destAddress: null,
  distanceMeters: 5400,
  priceCents: 1890,
  priceBreakdown: { base_cents: 500 },
  requestedAt: new Date("2026-09-09T10:00:00Z"),
  assignedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelledBy: null,
} as unknown as RideForResponse;

describe("serializeRide", () => {
  it("maps a driverless ride to the API contract shape", () => {
    const dto = serializeRide(baseRide);
    expect(dto).toMatchObject({
      id: "ride-1",
      status: "searching",
      passenger: { id: "user-1", name: "John Doe" },
      driver: null,
      origin: { lat: -3.73, lng: -38.52, address: "Rua das Flores, 100" },
      destination: { lat: -3.75, lng: -38.49, address: null },
      price_cents: 1890,
      currency: "BRL",
      requested_at: "2026-09-09T10:00:00.000Z",
      assigned_at: null,
    });
  });

  it("includes the assigned driver and its trust score", () => {
    const assigned = {
      ...baseRide,
      status: "assigned",
      driver: {
        id: "driver-1",
        vehicleModel: "Onix",
        vehiclePlate: "ABC1D23",
        user: { name: "Jane Doe" },
      },
      assignedAt: new Date("2026-09-09T10:05:00Z"),
    } as unknown as RideForResponse;

    const dto = serializeRide(assigned, { driverTrustScore: 0.92 });
    expect(dto.driver).toEqual({
      id: "driver-1",
      name: "Jane Doe",
      vehicle_model: "Onix",
      vehicle_plate: "ABC1D23",
      trust_score: 0.92,
    });
    expect(dto.assigned_at).toBe("2026-09-09T10:05:00.000Z");
  });
});
