import type { FastifyReply, FastifyRequest } from "fastify";
import { authUserId } from "../auth/auth-user.js";
import { trustScoreCacheKey } from "../trust-score/trust-score.cache.js";
import { serializeRating } from "./rating.serializer.js";

interface CreateRatingBody {
  score: number;
  comment?: string;
}

export async function createRating(req: FastifyRequest, reply: FastifyReply) {
  const raterId = authUserId(req);
  if (!raterId) {
    return reply.fail(401, "Não autenticado");
  }

  const { rideId } = req.params as { rideId: string };
  const { score, comment } = req.body as CreateRatingBody;

  const ride = await req.server.prisma.ride.findUnique({
    where: { id: rideId },
    include: { driver: { select: { userId: true } } },
  });
  if (!ride) {
    return reply.fail(404, "Corrida não encontrada");
  }
  if (ride.status !== "completed") {
    return reply.fail(409, "Só é possível avaliar corridas concluídas");
  }

  const driverUserId = ride.driver?.userId;
  let rateeId: string | undefined;
  if (raterId === ride.passengerId) {
    rateeId = driverUserId;
  } else if (raterId === driverUserId) {
    rateeId = ride.passengerId;
  } else {
    return reply.fail(403, "Você não faz parte desta corrida");
  }
  if (!rateeId) {
    return reply.fail(409, "Corrida sem motorista para avaliar");
  }

  try {
    const rating = await req.server.prisma.rating.create({
      data: {
        rideId,
        raterId,
        rateeId,
        score,
        comment: comment ?? null,
        createdById: raterId,
        updatedById: raterId,
      },
    });
    void req.server.redis.del(trustScoreCacheKey(rateeId)).catch(() => {});
    return reply.ok({ rating: serializeRating(rating) }, "Avaliação registrada", 201);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return reply.fail(409, "Você já avaliou esta corrida");
    }
    throw error;
  }
}

export async function getUserRatings(req: FastifyRequest, reply: FastifyReply) {
  const requesterId = authUserId(req);
  if (!requesterId) {
    return reply.fail(401, "Não autenticado");
  }

  const { userId } = req.params as { userId: string };
  const { page, page_size } = req.query as { page: number; page_size: number };

  const where = { rateeId: userId, deletedAt: null };
  const [total, ratings] = await req.server.prisma.$transaction([
    req.server.prisma.rating.count({ where }),
    req.server.prisma.rating.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * page_size,
      take: page_size,
    }),
  ]);

  return reply.ok(
    { items: ratings.map(serializeRating), page, page_size, total },
    "Avaliações do usuário",
  );
}
