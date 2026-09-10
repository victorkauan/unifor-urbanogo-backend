import { describe, expect, it } from "vitest";
import { candidateRank, normalizeTrust, rankCandidates } from "./candidate-ranking.js";

describe("normalizeTrust", () => {
  it("keeps a value already in the 0..1 range", () => {
    expect(normalizeTrust(0)).toBe(0);
    expect(normalizeTrust(0.73)).toBe(0.73);
    expect(normalizeTrust(1)).toBe(1);
  });

  it("maps a 1..5 average rating onto 0..1", () => {
    expect(normalizeTrust(5)).toBe(1);
    expect(normalizeTrust(3)).toBe(0.5);
    expect(normalizeTrust(1.0001)).toBeCloseTo(0, 3);
  });

  it("clamps and defaults on invalid input", () => {
    expect(normalizeTrust(9)).toBe(1);
    expect(normalizeTrust(-2)).toBe(0);
    expect(normalizeTrust(Number.NaN)).toBe(0.5);
  });
});

describe("candidateRank", () => {
  it("penalises lower trust as extra distance", () => {
    const near = { driverId: "a", userId: "ua", distanceKm: 1, trust: 1 };
    const nearButUntrusted = { driverId: "b", userId: "ub", distanceKm: 1, trust: 0 };
    expect(candidateRank(near, 2)).toBe(1);
    expect(candidateRank(nearButUntrusted, 2)).toBe(3);
  });
});

describe("rankCandidates", () => {
  it("orders by the combined distance and trust score", () => {
    const candidates = [
      { driverId: "far-trusted", userId: "u1", distanceKm: 4, trust: 1 },
      { driverId: "near-untrusted", userId: "u2", distanceKm: 2.5, trust: 0.1 },
      { driverId: "near-trusted", userId: "u3", distanceKm: 3, trust: 0.9 },
    ];
    expect(rankCandidates(candidates, 2).map((c) => c.driverId)).toEqual([
      "near-trusted",
      "far-trusted",
      "near-untrusted",
    ]);
  });

  it("does not mutate the input array", () => {
    const candidates = [
      { driverId: "a", userId: "ua", distanceKm: 2, trust: 0.5 },
      { driverId: "b", userId: "ub", distanceKm: 1, trust: 0.5 },
    ];
    rankCandidates(candidates, 1);
    expect(candidates.map((c) => c.driverId)).toEqual(["a", "b"]);
  });
});
