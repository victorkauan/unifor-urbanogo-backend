import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTrustScore } from "./trust-score.service.js";

const createCompletion = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

vi.mock("../../lib/config.js", () => ({
  config: { DEEPINFRA_API_KEY: "test-key", DEEPINFRA_TRUST_MODEL: "test-model" },
}));

interface FakePrismaOptions {
  average: number | null;
  ratingCount: number;
}

function fakePrisma({ average, ratingCount }: FakePrismaOptions) {
  const ratings = Array.from({ length: ratingCount }, (_, i) => ({
    score: 4,
    comment: null,
    createdAt: new Date(2026, 0, i + 1),
  }));
  const upsert = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    rating: {
      aggregate: vi.fn().mockResolvedValue({ _avg: { score: average } }),
      findMany: vi.fn().mockResolvedValue(ratings),
    },
    trustScore: { upsert },
  } as unknown as PrismaClient;
  return { prisma, upsert };
}

function llmReplies(content: string | null) {
  createCompletion.mockResolvedValueOnce({ choices: [{ message: { content } }] });
}

function savedWith(upsert: ReturnType<typeof vi.fn>) {
  return upsert.mock.calls[0][0].update as { score: number; source: string };
}

beforeEach(() => {
  createCompletion.mockReset();
});

describe("getTrustScore with the LLM enabled", () => {
  it("uses the LLM score and tags the source as llm", async () => {
    const { prisma, upsert } = fakePrisma({ average: 3, ratingCount: 5 });
    llmReplies('{"score": 0.82, "reason": "estável"}');

    const score = await getTrustScore(prisma, "user-1");

    expect(score).toBe(0.82);
    expect(savedWith(upsert)).toMatchObject({ score: 0.82, source: "llm" });
  });

  it("clamps an out-of-range LLM score into 0..1", async () => {
    const { prisma } = fakePrisma({ average: 5, ratingCount: 3 });
    llmReplies('{"score": 1.7}');

    expect(await getTrustScore(prisma, "user-1")).toBe(1);
  });

  it("falls back to the normalized average when the LLM returns no content", async () => {
    const { prisma, upsert } = fakePrisma({ average: 3, ratingCount: 4 });
    llmReplies(null);

    const score = await getTrustScore(prisma, "user-1");

    expect(score).toBe(0.5);
    expect(savedWith(upsert)).toMatchObject({ score: 0.5, source: "stub" });
  });

  it("falls back when the LLM payload has a non-numeric score", async () => {
    const { prisma, upsert } = fakePrisma({ average: 5, ratingCount: 4 });
    llmReplies('{"score": "great"}');

    expect(await getTrustScore(prisma, "user-1")).toBe(1);
    expect(savedWith(upsert).source).toBe("stub");
  });

  it("falls back when the LLM call throws", async () => {
    const { prisma, upsert } = fakePrisma({ average: 1, ratingCount: 6 });
    createCompletion.mockRejectedValueOnce(new Error("timeout"));

    expect(await getTrustScore(prisma, "user-1")).toBe(0);
    expect(savedWith(upsert).source).toBe("stub");
  });

  it("does not call the LLM when there are no ratings", async () => {
    const { prisma, upsert } = fakePrisma({ average: null, ratingCount: 0 });

    expect(await getTrustScore(prisma, "user-1")).toBe(1);
    expect(createCompletion).not.toHaveBeenCalled();
    expect(savedWith(upsert)).toMatchObject({ score: 1, source: "stub" });
  });
});
