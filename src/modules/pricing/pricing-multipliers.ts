import type { FareMultipliers } from "./pricing.service.js";

export type WeatherCondition =
  "clear" | "clouds" | "fog" | "drizzle" | "rain" | "heavy_rain" | "snow" | "thunderstorm";

export interface MultiplierContext {
  at: Date;
  demandRatio?: number;
  weather?: WeatherCondition;
}

export interface PeakWindow {
  startHour: number;
  endHour: number;
}

export interface DemandTier {
  minRatio: number;
  factor: number;
}

export interface MultiplierConfig {
  timeZone: string;
  peakFactor: number;
  offPeakFactor: number;
  peakWeekdays: number[];
  peakWindows: PeakWindow[];
  demandTiers: DemandTier[];
  weatherFactors: Record<WeatherCondition, number>;
  minFactor: number;
  maxFactor: number;
}

export const DEFAULT_MULTIPLIER_CONFIG: MultiplierConfig = {
  timeZone: "America/Fortaleza",
  peakFactor: 1.25,
  offPeakFactor: 1,
  peakWeekdays: [1, 2, 3, 4, 5],
  peakWindows: [
    { startHour: 6, endHour: 9 },
    { startHour: 17, endHour: 20 },
  ],
  demandTiers: [
    { minRatio: 2, factor: 1.6 },
    { minRatio: 1, factor: 1.35 },
    { minRatio: 0.5, factor: 1.15 },
  ],
  weatherFactors: {
    clear: 1,
    clouds: 1,
    fog: 1.05,
    drizzle: 1.05,
    rain: 1.15,
    heavy_rain: 1.25,
    snow: 1.2,
    thunderstorm: 1.3,
  },
  minFactor: 1,
  maxFactor: 2.5,
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function zonedParts(at: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const weekdayPart = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";

  return { weekday: WEEKDAY_INDEX[weekdayPart] ?? 0, hour: Number(hourPart) % 24 };
}

export function timeMultiplier(
  at: Date,
  config: MultiplierConfig = DEFAULT_MULTIPLIER_CONFIG,
): number {
  const { weekday, hour } = zonedParts(at, config.timeZone);

  if (!config.peakWeekdays.includes(weekday)) {
    return config.offPeakFactor;
  }

  const inPeakWindow = config.peakWindows.some(
    (window) => hour >= window.startHour && hour < window.endHour,
  );

  return inPeakWindow ? config.peakFactor : config.offPeakFactor;
}

export function demandMultiplier(
  demandRatio: number | undefined,
  config: MultiplierConfig = DEFAULT_MULTIPLIER_CONFIG,
): number {
  if (demandRatio === undefined || !Number.isFinite(demandRatio) || demandRatio <= 0) {
    return 1;
  }

  const tier = config.demandTiers.find((candidate) => demandRatio >= candidate.minRatio);
  return tier ? tier.factor : 1;
}

export function weatherMultiplier(
  weather: WeatherCondition | undefined,
  config: MultiplierConfig = DEFAULT_MULTIPLIER_CONFIG,
): number {
  if (weather === undefined) {
    return 1;
  }
  return config.weatherFactors[weather] ?? 1;
}

export function combineMultipliers(
  context: MultiplierContext,
  config: MultiplierConfig = DEFAULT_MULTIPLIER_CONFIG,
): FareMultipliers {
  return {
    time: round2(clamp(timeMultiplier(context.at, config), config.minFactor, config.maxFactor)),
    demand: round2(
      clamp(demandMultiplier(context.demandRatio, config), config.minFactor, config.maxFactor),
    ),
    weather: round2(
      clamp(weatherMultiplier(context.weather, config), config.minFactor, config.maxFactor),
    ),
  };
}
