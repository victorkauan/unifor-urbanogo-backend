import { haversineKm, type LatLng } from "../../lib/geo.js";
import { combineMultipliers, type WeatherCondition } from "../pricing/pricing-multipliers.js";
import { calculateFare, type FareBreakdown } from "../pricing/pricing.service.js";
import { fetchCurrentWeather } from "../pricing/weather.js";

export const QUOTE_TTL_MS = 5 * 60_000;

export interface QuoteInput {
  origin: LatLng;
  destination: LatLng;
}

export interface QuoteResult {
  distance_meters: number;
  price_cents: number;
  currency: string;
  price_breakdown: FareBreakdown;
  expires_at: string;
}

export interface QuoteDeps {
  now?: () => number;
  resolveWeather?: (point: LatLng) => Promise<WeatherCondition | undefined>;
  resolveDemandRatio?: (point: LatLng) => Promise<number | undefined>;
}

export async function quotePrice(input: QuoteInput, deps: QuoteDeps = {}): Promise<QuoteResult> {
  const now = deps.now ?? (() => Date.now());
  const resolveWeather =
    deps.resolveWeather ?? ((point) => fetchCurrentWeather(point.lat, point.lng));
  const resolveDemandRatio = deps.resolveDemandRatio ?? (() => Promise.resolve(undefined));

  const distanceMeters = Math.round(haversineKm(input.origin, input.destination) * 1000);
  const [weather, demandRatio] = await Promise.all([
    resolveWeather(input.origin).catch(() => undefined),
    resolveDemandRatio(input.origin).catch(() => undefined),
  ]);
  const multipliers = combineMultipliers({ at: new Date(now()), weather, demandRatio });
  const fare = calculateFare({ distanceMeters, multipliers });

  return {
    distance_meters: distanceMeters,
    price_cents: fare.amount_cents,
    currency: fare.currency,
    price_breakdown: fare.breakdown,
    expires_at: new Date(now() + QUOTE_TTL_MS).toISOString(),
  };
}
