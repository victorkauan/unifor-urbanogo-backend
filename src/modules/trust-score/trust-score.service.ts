import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();

export async function getTrustScore(userId: string): Promise<number> {
  const aggregation = await prisma.rating.aggregate({
    _avg: { score: true },
    where: { rateeId: userId },
  });

  const fallbackScore = aggregation._avg.score || 5.0;

  if (!process.env.DEEPINFRA_API_KEY) {
    await saveScore(userId, fallbackScore, "stub");
    return fallbackScore;
  }

  const ratings = await prisma.rating.findMany({
    where: { rateeId: userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { score: true, comment: true, createdAt: true },
  });

  if (ratings.length === 0) {
    await saveScore(userId, fallbackScore, "stub");
    return fallbackScore;
  }

  try {
    const openai = new OpenAI({
      baseURL: "https://api.deepinfra.com/v1/openai",
      apiKey: process.env.DEEPINFRA_API_KEY,
    });

    const response = await openai.chat.completions.create(
      {
        model: "meta-llama/Meta-Llama-3-70B-Instruct",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Analyze the user rating history. Look for recent quality drops. Output a valid JSON exactly like this: {"score": number, "reason": "string"}. The "score" must be between 0.0 and 1.0.',
          },
          {
            role: "user",
            content: JSON.stringify(ratings),
          },
        ],
      },
      { timeout: 5000 },
    );

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response");
    }

    const parsed = JSON.parse(content);
    const llmScore = typeof parsed.score === "number" ? parsed.score * 5 : fallbackScore;
    const finalScore = Math.max(1, Math.min(5, llmScore));

    await saveScore(userId, finalScore, "llm");
    return finalScore;
  } catch {
    await saveScore(userId, fallbackScore, "stub");
    return fallbackScore;
  }
}

async function saveScore(userId: string, score: number, source: "stub" | "llm") {
  await prisma.trustScore.upsert({
    where: { userId },
    update: {
      score,
      source,
      computedAt: new Date(),
    },
    create: {
      userId,
      score,
      source,
      computedAt: new Date(),
    },
  });
}
