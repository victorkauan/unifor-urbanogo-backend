import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findNearbyOnlineDrivers } from "../src/modules/rides/nearby-drivers.js";
import { seed } from "./seed.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("database seed", () => {
  const prisma = new PrismaClient();
  const seedUser = { email: { endsWith: "@example.com" } };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function countSeedRows() {
    return {
      users: await prisma.user.count({ where: seedUser }),
      drivers: await prisma.driver.count({ where: { user: seedUser } }),
      locations: await prisma.driverLocation.count({ where: { driver: { user: seedUser } } }),
      trustScores: await prisma.trustScore.count({ where: { user: seedUser } }),
    };
  }

  it("populates passengers, drivers, locations and trust scores", async () => {
    await seed(prisma);
    expect(await countSeedRows()).toEqual({
      users: 16,
      drivers: 10,
      locations: 10,
      trustScores: 10,
    });
  });

  it("is idempotent when run again", async () => {
    await seed(prisma);
    const first = await countSeedRows();
    await seed(prisma);
    expect(await countSeedRows()).toEqual(first);
  });

  it("spreads online drivers within a few km of Fortaleza", async () => {
    await seed(prisma);
    const nearby = await findNearbyOnlineDrivers(prisma, {
      origin: { lat: -3.7319, lng: -38.5267 },
      radiusKm: 10,
      limit: 50,
    });

    expect(nearby.length).toBeGreaterThanOrEqual(8);
    for (const row of nearby) {
      expect(row.distanceKm).toBeLessThanOrEqual(10);
    }
  });
});
