import { DEFAULT_PRICING_CONFIG, type PricingConfig } from "./pricing.config.js";

export interface FareInput {
  distanceMeters: number;
  multipliers?: Partial<FareMultipliers>;
}

export interface FareMultipliers {
  time: number;
  demand: number;
  weather: number;
}

export interface FareBreakdown {
  base_cents: number;
  per_km_cents: number;
  distance_km: number;
  distance_cents: number;
  service_fee_cents: number;
  multipliers: FareMultipliers;
}

export interface Fare {
  amount_cents: number;
  currency: string;
  breakdown: FareBreakdown;
}

const NEUTRAL_MULTIPLIERS: FareMultipliers = { time: 1, demand: 1, weather: 1 };

export function calculateFare(
  input: FareInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): Fare {
  const { distanceMeters } = input;

  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error("distanceMeters must be a non-negative finite number");
  }

  const multipliers: FareMultipliers = {
    time: input.multipliers?.time ?? NEUTRAL_MULTIPLIERS.time,
    demand: input.multipliers?.demand ?? NEUTRAL_MULTIPLIERS.demand,
    weather: input.multipliers?.weather ?? NEUTRAL_MULTIPLIERS.weather,
  };

  for (const [name, value] of Object.entries(multipliers)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`multiplier "${name}" must be a positive finite number`);
    }
  }

  const combinedMultiplier = multipliers.time * multipliers.demand * multipliers.weather;
  const distanceKm = distanceMeters / 1000;
  const distanceCents = Math.round(distanceKm * config.perKmCents * combinedMultiplier);
  const amountCents = config.baseFareCents + distanceCents + config.serviceFeeCents;

  return {
    amount_cents: amountCents,
    currency: config.currency,
    breakdown: {
      base_cents: config.baseFareCents,
      per_km_cents: config.perKmCents,
      distance_km: distanceKm,
      distance_cents: distanceCents,
      service_fee_cents: config.serviceFeeCents,
      multipliers,
    },
  };
}
