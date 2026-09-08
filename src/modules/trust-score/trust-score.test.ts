import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getTrustScore } from "./trust-score.service.js";

const prisma = new PrismaClient();

describe("Trust Score Service", () => {
  const rateeEmail = "ratee-trust@example.com";
  const raterEmail = "rater-trust@example.com";
  let rateeId: string;
  let raterId: string;

  beforeAll(async () => {
    const ratee = await prisma.user.create({
      data: {
        name: "Ratee User",
        email: rateeEmail,
        passwordHash: "hashed",
        role: "both",
      },
    });
    rateeId = ratee.id;

    const rater = await prisma.user.create({
      data: {
        name: "Rater User",
        email: raterEmail,
        passwordHash: "hashed",
        role: "both",
      },
    });
    raterId = rater.id;
  });

  afterAll(async () => {
    await prisma.rating.deleteMany({ where: { rateeId } });
    await prisma.trustScore.deleteMany({ where: { userId: rateeId } });
    await prisma.ride.deleteMany({ where: { passengerId: rateeId } });
    await prisma.user.deleteMany({ where: { email: { in: [rateeEmail, raterEmail] } } });
  });

  it("should return a default score of 5.0 when the user has no ratings", async () => {
    const score = await getTrustScore(rateeId);
    expect(score).toBe(5.0);
  });

  it("should return the simple average of all received ratings", async () => {
    const ride1 = await prisma.ride.create({
      data: {
        passengerId: rateeId,
        type: "ride",
        originLat: 0,
        originLng: 0,
        destLat: 0,
        destLng: 0,
      },
    });

    await prisma.rating.create({
      data: {
        rideId: ride1.id,
        raterId,
        rateeId,
        score: 3,
      },
    });

    const ride2 = await prisma.ride.create({
      data: {
        passengerId: rateeId,
        type: "ride",
        originLat: 0,
        originLng: 0,
        destLat: 0,
        destLng: 0,
      },
    });

    await prisma.rating.create({
      data: {
        rideId: ride2.id,
        raterId,
        rateeId,
        score: 5,
      },
    });

    const score = await getTrustScore(rateeId);

    expect(score).toBe(4.0);

    const savedTrustScore = await prisma.trustScore.findUnique({
      where: { userId: rateeId },
    });
    expect(savedTrustScore?.score).toBe(4.0);
    expect(savedTrustScore?.source).toBe("stub");
  });
});
