import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTrustScore, normalizeRatingAverage } from "./trust-score.service.js";

describe("normalizeRatingAverage", () => {
  it("maps a 1..5 average onto 0..1", () => {
    expect(normalizeRatingAverage(5)).toBe(1);
    expect(normalizeRatingAverage(4)).toBe(0.75);
    expect(normalizeRatingAverage(3)).toBe(0.5);
    expect(normalizeRatingAverage(1)).toBe(0);
  });

  it("treats the absence of ratings as full trust", () => {
    expect(normalizeRatingAverage(null)).toBe(1);
    expect(normalizeRatingAverage(Number.NaN)).toBe(1);
  });

  it("clamps out-of-range averages", () => {
    expect(normalizeRatingAverage(9)).toBe(1);
    expect(normalizeRatingAverage(0)).toBe(0);
  });
});

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("getTrustScore (database)", () => {
  const prisma = new PrismaClient();
  const rateeEmail = `ratee-trust-${Date.now()}@example.com`;
  const raterEmail = `rater-trust-${Date.now()}@example.com`;
  let rateeId: string;
  let raterId: string;

  beforeAll(async () => {
    await prisma.$connect();
    rateeId = (
      await prisma.user.create({
        data: { name: "Ratee", email: rateeEmail, passwordHash: "x", role: "both" },
      })
    ).id;
    raterId = (
      await prisma.user.create({
        data: { name: "Rater", email: raterEmail, passwordHash: "x", role: "both" },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.rating.deleteMany({ where: { rateeId } });
    await prisma.trustScore.deleteMany({ where: { userId: rateeId } });
    await prisma.ride.deleteMany({ where: { passengerId: rateeId } });
    await prisma.user.deleteMany({ where: { email: { in: [rateeEmail, raterEmail] } } });
    await prisma.$disconnect();
  });

  async function rate(score: number) {
    const ride = await prisma.ride.create({
      data: {
        passengerId: rateeId,
        type: "ride",
        status: "completed",
        originLat: 0,
        originLng: 0,
        destLat: 0,
        destLng: 0,
      },
    });
    await prisma.rating.create({ data: { rideId: ride.id, raterId, rateeId, score } });
  }

  it("returns full trust and persists it when there are no ratings", async () => {
    const score = await getTrustScore(prisma, rateeId);
    expect(score).toBe(1);
    const saved = await prisma.trustScore.findUnique({ where: { userId: rateeId } });
    expect(saved?.score).toBe(1);
    expect(saved?.source).toBe("stub");
  });

  it("persists the normalized average of received ratings", async () => {
    await rate(3);
    await rate(5);
    const score = await getTrustScore(prisma, rateeId);
    expect(score).toBe(0.75);
    const saved = await prisma.trustScore.findUnique({ where: { userId: rateeId } });
    expect(saved?.score).toBe(0.75);
  });
});
