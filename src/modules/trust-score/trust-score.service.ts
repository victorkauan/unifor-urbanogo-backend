import type { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { config } from "../../lib/config.js";

const LLM_BASE_URL = "https://api.deepinfra.com/v1/openai";
const LLM_TIMEOUT_MS = 5000;
const RATING_HISTORY_SIZE = 20;

type TrustScoreSource = "stub" | "llm";

type RatingHistoryEntry = {
  score: number;
  comment: string | null;
  createdAt: Date;
};

export function normalizeRatingAverage(average: number | null): number {
  if (average === null || !Number.isFinite(average)) {
    return 1;
  }
  return Math.min(1, Math.max(0, (average - 1) / 4));
}

async function persistTrustScore(
  prisma: PrismaClient,
  userId: string,
  score: number,
  source: TrustScoreSource,
): Promise<void> {
  await prisma.trustScore.upsert({
    where: { userId },
    update: { score, source, computedAt: new Date() },
    create: { userId, score, source, computedAt: new Date() },
  });
}

async function analyzeWithLlm(ratings: RatingHistoryEntry[]): Promise<number | null> {
  const client = new OpenAI({ baseURL: LLM_BASE_URL, apiKey: config.DEEPINFRA_API_KEY });

  const response = await client.chat.completions.create(
    {
      model: config.DEEPINFRA_TRUST_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Analyze the rating history of a mobility app user and detect recent drops in service quality that a plain average would hide. Respond only with JSON shaped as {"score": number, "reason": "string"} where score is between 0.0 and 1.0.',
        },
        { role: "user", content: JSON.stringify(ratings) },
      ],
    },
    { timeout: LLM_TIMEOUT_MS },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return null;
  }

  const parsed = JSON.parse(content) as { score?: unknown };
  if (typeof parsed.score !== "number" || !Number.isFinite(parsed.score)) {
    return null;
  }

  return Math.min(1, Math.max(0, parsed.score));
}

export async function getTrustScore(prisma: PrismaClient, userId: string): Promise<number> {
  const aggregation = await prisma.rating.aggregate({
    _avg: { score: true },
    where: { rateeId: userId, deletedAt: null },
  });

  const fallbackScore = normalizeRatingAverage(aggregation._avg.score);

  if (!config.DEEPINFRA_API_KEY) {
    await persistTrustScore(prisma, userId, fallbackScore, "stub");
    return fallbackScore;
  }

  const ratings = await prisma.rating.findMany({
    where: { rateeId: userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: RATING_HISTORY_SIZE,
    select: { score: true, comment: true, createdAt: true },
  });

  if (ratings.length === 0) {
    await persistTrustScore(prisma, userId, fallbackScore, "stub");
    return fallbackScore;
  }

  try {
    const llmScore = await analyzeWithLlm(ratings);
    if (llmScore === null) {
      await persistTrustScore(prisma, userId, fallbackScore, "stub");
      return fallbackScore;
    }

    await persistTrustScore(prisma, userId, llmScore, "llm");
    return llmScore;
  } catch {
    await persistTrustScore(prisma, userId, fallbackScore, "stub");
    return fallbackScore;
  }
}
