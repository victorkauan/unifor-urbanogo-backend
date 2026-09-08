import type { PrismaClient } from "@prisma/client";

const ACTIVE_RIDE_STATUSES = ["assigned", "in_progress"] as const;

export async function findActiveRideIdForDriver(
  prisma: PrismaClient,
  userId: string,
): Promise<string | null> {
  const ride = await prisma.ride.findFirst({
    where: {
      status: { in: [...ACTIVE_RIDE_STATUSES] },
      driver: { userId },
    },
    select: { id: true },
    orderBy: { assignedAt: "desc" },
  });

  return ride?.id ?? null;
}
