import type { FastifyReply, FastifyRequest } from "fastify";
import { authUserId } from "../auth/auth-user.js";
import { getTrustScore } from "./trust-score.service.js";

export async function getUserTrustScore(req: FastifyRequest, reply: FastifyReply) {
  const requesterId = authUserId(req);
  if (!requesterId) {
    return reply.fail(401, "Não autenticado");
  }

  const { userId } = req.params as { userId: string };
  await getTrustScore(req.server.prisma, userId);
  const row = await req.server.prisma.trustScore.findUniqueOrThrow({ where: { userId } });

  return reply.ok(
    {
      trust_score: {
        user_id: row.userId,
        score: row.score,
        source: row.source,
        computed_at: row.computedAt.toISOString(),
      },
    },
    "Nota de confiança",
  );
}
