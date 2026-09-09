import type { PrismaClient } from "@prisma/client";

export function normalizeRatingAverage(average: number | null): number {
  if (average === null || !Number.isFinite(average)) {
    return 1;
  }
  return Math.min(1, Math.max(0, (average - 1) / 4));
}

export async function getTrustScore(prisma: PrismaClient, userId: string): Promise<number> {
  const aggregation = await prisma.rating.aggregate({
    _avg: { score: true },
    where: { rateeId: userId, deletedAt: null },
  });

  const score = normalizeRatingAverage(aggregation._avg.score);

  await prisma.trustScore.upsert({
    where: { userId },
    update: { score, source: "stub", computedAt: new Date() },
    create: { userId, score, source: "stub", computedAt: new Date() },
  });

  return score;
}
