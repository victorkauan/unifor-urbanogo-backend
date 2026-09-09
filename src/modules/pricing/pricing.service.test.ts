import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_CONFIG } from "./pricing.config.js";
import { calculateFare } from "./pricing.service.js";

describe("calculateFare", () => {
  it("charges only the base fare plus the service fee for a zero-distance trip", () => {
    const fare = calculateFare({ distanceMeters: 0 });
    expect(fare.amount_cents).toBe(700);
    expect(fare.currency).toBe("BRL");
    expect(fare.breakdown.distance_cents).toBe(0);
  });

  it("adds the per-km fare for a known trip (5.4 km)", () => {
    const fare = calculateFare({ distanceMeters: 5400 });
    expect(fare.breakdown.distance_cents).toBe(972);
    expect(fare.amount_cents).toBe(500 + 972 + 200);
  });

  it("computes a few more trips consistently", () => {
    expect(calculateFare({ distanceMeters: 1000 }).amount_cents).toBe(880);
    expect(calculateFare({ distanceMeters: 12345 }).amount_cents).toBe(500 + 2222 + 200);
    expect(calculateFare({ distanceMeters: 250 }).amount_cents).toBe(500 + 45 + 200);
  });

  it("rounds the distance fare to the nearest cent", () => {
    expect(calculateFare({ distanceMeters: 2 }).breakdown.distance_cents).toBe(0);
    expect(calculateFare({ distanceMeters: 3 }).breakdown.distance_cents).toBe(1);
  });

  it("returns a breakdown that adds up to the total", () => {
    const { amount_cents, breakdown } = calculateFare({ distanceMeters: 8200 });
    expect(breakdown.base_cents + breakdown.distance_cents + breakdown.service_fee_cents).toBe(
      amount_cents,
    );
    expect(breakdown.base_cents).toBe(DEFAULT_PRICING_CONFIG.baseFareCents);
    expect(breakdown.per_km_cents).toBe(DEFAULT_PRICING_CONFIG.perKmCents);
    expect(breakdown.service_fee_cents).toBe(DEFAULT_PRICING_CONFIG.serviceFeeCents);
    expect(breakdown.distance_km).toBe(8.2);
  });

  it("keeps the multipliers neutral at this stage", () => {
    expect(calculateFare({ distanceMeters: 5400 }).breakdown.multipliers).toEqual({
      time: 1,
      demand: 1,
      weather: 1,
    });
  });

  it("honours a custom pricing config", () => {
    const fare = calculateFare(
      { distanceMeters: 10000 },
      { currency: "BRL", baseFareCents: 700, perKmCents: 200, serviceFeeCents: 0 },
    );
    expect(fare.amount_cents).toBe(700 + 2000 + 0);
  });

  it("rejects an invalid distance", () => {
    expect(() => calculateFare({ distanceMeters: -1 })).toThrow();
    expect(() => calculateFare({ distanceMeters: Number.NaN })).toThrow();
    expect(() => calculateFare({ distanceMeters: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("applies the surge multipliers to the distance fare only", () => {
    const fare = calculateFare({
      distanceMeters: 5400,
      multipliers: { time: 1.25, demand: 1.6, weather: 1 },
    });
    expect(fare.breakdown.distance_cents).toBe(Math.round(5.4 * 180 * 1.25 * 1.6));
    expect(fare.amount_cents).toBe(500 + fare.breakdown.distance_cents + 200);
    expect(fare.breakdown.multipliers).toEqual({ time: 1.25, demand: 1.6, weather: 1 });
  });

  it("fills missing multipliers with a neutral factor", () => {
    const fare = calculateFare({ distanceMeters: 1000, multipliers: { demand: 2 } });
    expect(fare.breakdown.multipliers).toEqual({ time: 1, demand: 2, weather: 1 });
    expect(fare.breakdown.distance_cents).toBe(360);
  });

  it("rejects a non-positive multiplier", () => {
    expect(() => calculateFare({ distanceMeters: 1000, multipliers: { time: 0 } })).toThrow();
    expect(() =>
      calculateFare({ distanceMeters: 1000, multipliers: { weather: Number.NaN } }),
    ).toThrow();
  });
});
