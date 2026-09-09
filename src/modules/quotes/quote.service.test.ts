import { describe, expect, it } from "vitest";
import { haversineKm } from "../../lib/geo.js";
import { QUOTE_TTL_MS, quotePrice } from "./quote.service.js";

const ORIGIN = { lat: -3.7319, lng: -38.5267 };
const DESTINATION = { lat: -3.75, lng: -38.49 };
const EXPECTED_DISTANCE_M = Math.round(haversineKm(ORIGIN, DESTINATION) * 1000);

const OFF_PEAK = () => Date.parse("2026-09-08T15:00:00Z"); // Tuesday 12:00 in Fortaleza
const PEAK = () => Date.parse("2026-09-08T11:00:00Z"); // Tuesday 08:00 in Fortaleza

describe("quotePrice", () => {
  it("prices a trip with the weather multiplier applied to the distance fare", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      { now: OFF_PEAK, resolveWeather: async () => "rain" },
    );

    expect(quote.distance_meters).toBe(EXPECTED_DISTANCE_M);
    expect(quote.currency).toBe("BRL");
    expect(quote.price_breakdown.multipliers).toEqual({ time: 1, demand: 1, weather: 1.15 });

    const distanceCents = Math.round((EXPECTED_DISTANCE_M / 1000) * 180 * 1.15);
    expect(quote.price_breakdown.distance_cents).toBe(distanceCents);
    expect(quote.price_cents).toBe(500 + distanceCents + 200);
  });

  it("applies the peak-hour multiplier", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      { now: PEAK, resolveWeather: async () => undefined },
    );
    expect(quote.price_breakdown.multipliers.time).toBe(1.25);
  });

  it("keeps the weather multiplier neutral when the weather is unknown", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      { now: OFF_PEAK, resolveWeather: async () => undefined },
    );
    expect(quote.price_breakdown.multipliers.weather).toBe(1);
  });

  it("degrades gracefully when the weather lookup throws", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      {
        now: OFF_PEAK,
        resolveWeather: async () => {
          throw new Error("open-meteo down");
        },
      },
    );
    expect(quote.price_breakdown.multipliers.weather).toBe(1);
    expect(quote.price_cents).toBeGreaterThan(0);
  });

  it("applies the demand multiplier when a demand ratio is resolved", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      { now: OFF_PEAK, resolveWeather: async () => undefined, resolveDemandRatio: async () => 2 },
    );
    expect(quote.price_breakdown.multipliers.demand).toBe(1.6);
  });

  it("keeps the demand multiplier neutral when there is no demand signal", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      {
        now: OFF_PEAK,
        resolveWeather: async () => undefined,
        resolveDemandRatio: async () => undefined,
      },
    );
    expect(quote.price_breakdown.multipliers.demand).toBe(1);
  });

  it("degrades gracefully when the demand lookup throws", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      {
        now: OFF_PEAK,
        resolveWeather: async () => undefined,
        resolveDemandRatio: async () => {
          throw new Error("redis down");
        },
      },
    );
    expect(quote.price_breakdown.multipliers.demand).toBe(1);
    expect(quote.price_cents).toBeGreaterThan(0);
  });

  it("sets an expiry a fixed window ahead", async () => {
    const quote = await quotePrice(
      { origin: ORIGIN, destination: DESTINATION },
      { now: OFF_PEAK, resolveWeather: async () => undefined },
    );
    expect(quote.expires_at).toBe(new Date(OFF_PEAK() + QUOTE_TTL_MS).toISOString());
  });
});
