import { randomUUID } from "node:crypto";
import type { Driver, PrismaClient, User } from "@prisma/client";

export async function createTestUser(
  prisma: PrismaClient,
  overrides: Partial<User> = {},
): Promise<User> {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      name: "Test User",
      email: `user-${id}@example.com`,
      passwordHash: "not-a-real-hash",
      role: "passenger",
      ...overrides,
    },
  });
}

export async function createTestDriver(
  prisma: PrismaClient,
  overrides: Partial<Driver> = {},
): Promise<Driver> {
  const userId = overrides.userId ?? (await createTestUser(prisma, { role: "driver" })).id;

  return prisma.driver.create({
    data: {
      userId,
      servicePreference: "both",
      vehicleModel: "Onix",
      vehiclePlate: "ABC1D23",
      ...overrides,
    },
  });
}
