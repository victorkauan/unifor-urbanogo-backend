import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getTrustScore(userId: string): Promise<number> {
  const aggregation = await prisma.rating.aggregate({
    _avg: { score: true },
    where: { rateeId: userId },
  });

  const score = aggregation._avg.score || 5.0;

  await prisma.trustScore.upsert({
    where: { userId },
    update: {
      score,
      source: "stub",
      computedAt: new Date(),
    },
    create: {
      userId,
      score,
      source: "stub",
      computedAt: new Date(),
    },
  });

  return score;
}
