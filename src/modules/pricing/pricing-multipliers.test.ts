import { describe, expect, it } from "vitest";
import {
  DEFAULT_MULTIPLIER_CONFIG,
  combineMultipliers,
  demandMultiplier,
  timeMultiplier,
  weatherMultiplier,
} from "./pricing-multipliers.js";

describe("timeMultiplier", () => {
  it("charges the peak factor during the weekday morning window", () => {
    expect(timeMultiplier(new Date("2026-09-08T09:00:00Z"))).toBe(1.25);
    expect(timeMultiplier(new Date("2026-09-08T11:00:00Z"))).toBe(1.25);
  });

  it("charges the peak factor during the weekday evening window", () => {
    expect(timeMultiplier(new Date("2026-09-08T21:00:00Z"))).toBe(1.25);
  });

  it("charges the off-peak factor outside the windows", () => {
    expect(timeMultiplier(new Date("2026-09-08T15:00:00Z"))).toBe(1);
  });

  it("treats the window end hour as off-peak", () => {
    expect(timeMultiplier(new Date("2026-09-08T12:00:00Z"))).toBe(1);
  });

  it("never charges the peak factor on weekends", () => {
    expect(timeMultiplier(new Date("2026-09-06T11:00:00Z"))).toBe(1);
    expect(timeMultiplier(new Date("2026-09-05T20:00:00Z"))).toBe(1);
  });
});

describe("demandMultiplier", () => {
  it("is neutral without a demand signal", () => {
    expect(demandMultiplier(undefined)).toBe(1);
    expect(demandMultiplier(Number.NaN)).toBe(1);
    expect(demandMultiplier(-2)).toBe(1);
  });

  it("steps up through the demand tiers", () => {
    expect(demandMultiplier(0.3)).toBe(1);
    expect(demandMultiplier(0.5)).toBe(1.15);
    expect(demandMultiplier(0.9)).toBe(1.15);
    expect(demandMultiplier(1)).toBe(1.35);
    expect(demandMultiplier(1.9)).toBe(1.35);
    expect(demandMultiplier(2)).toBe(1.6);
    expect(demandMultiplier(6)).toBe(1.6);
  });
});

describe("weatherMultiplier", () => {
  it("is neutral for clear or unknown weather", () => {
    expect(weatherMultiplier(undefined)).toBe(1);
    expect(weatherMultiplier("clear")).toBe(1);
    expect(weatherMultiplier("clouds")).toBe(1);
  });

  it("charges more for rain and storms", () => {
    expect(weatherMultiplier("rain")).toBe(1.15);
    expect(weatherMultiplier("heavy_rain")).toBe(1.25);
    expect(weatherMultiplier("thunderstorm")).toBe(1.3);
  });
});

describe("combineMultipliers", () => {
  it("combines time, demand and weather into one set of factors", () => {
    expect(
      combineMultipliers({
        at: new Date("2026-09-08T11:00:00Z"),
        demandRatio: 2.5,
        weather: "rain",
      }),
    ).toEqual({ time: 1.25, demand: 1.6, weather: 1.15 });
  });

  it("returns neutral factors when there is no surge context", () => {
    expect(combineMultipliers({ at: new Date("2026-09-08T15:00:00Z") })).toEqual({
      time: 1,
      demand: 1,
      weather: 1,
    });
  });

  it("clamps each factor to the configured range", () => {
    const config = { ...DEFAULT_MULTIPLIER_CONFIG, maxFactor: 1.2 };
    expect(
      combineMultipliers({ at: new Date("2026-09-08T15:00:00Z"), demandRatio: 5 }, config).demand,
    ).toBe(1.2);
  });
});
