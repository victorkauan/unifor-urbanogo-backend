import type { FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

type CreateRatingBody = {
  rideId: string;
  score: number;
  comment?: string;
};

type GetUserRatingsParams = {
  userId: string;
};

export async function createRating(
  req: FastifyRequest<{ Body: CreateRatingBody }>,
  reply: FastifyReply,
) {
  const { rideId, score, comment } = req.body;
  const raterId = (req as FastifyRequest & { user?: { id: string } }).user?.id;

  if (!raterId) {
    return reply.fail(401, "User not authenticated");
  }

  try {
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { driver: true },
    });

    if (!ride) {
      return reply.fail(404, "Ride not found");
    }

    if (ride.status !== "completed") {
      return reply.fail(400, "You can only rate completed rides");
    }

    const passengerId = ride.passengerId;
    const driverUserId = ride.driver?.userId;

    let rateeId;
    if (raterId === passengerId) {
      rateeId = driverUserId;
    } else if (raterId === driverUserId) {
      rateeId = passengerId;
    } else {
      return reply.fail(403, "You are not part of this ride");
    }

    if (!rateeId) {
      return reply.fail(400, "Cannot rate a ride without a driver");
    }

    const rating = await prisma.rating.create({
      data: {
        rideId,
        raterId,
        rateeId,
        score,
        comment,
        createdById: raterId,
        updatedById: raterId,
      },
    });

    return reply.status(201).send(rating);
  } catch (error: unknown) {
    const err = error as { code?: string };

    if (err.code === "P2002") {
      return reply.fail(409, "You have already rated this ride");
    }
    throw error;
  }
}

export async function getUserRatings(
  req: FastifyRequest<{ Params: GetUserRatingsParams }>,
  reply: FastifyReply,
) {
  const { userId } = req.params;

  const ratings = await prisma.rating.findMany({
    where: { rateeId: userId },
    include: {
      rater: { select: { id: true, name: true } },
      ride: { select: { id: true, type: true, completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const aggregation = await prisma.rating.aggregate({
    _avg: { score: true },
    _count: { id: true },
    where: { rateeId: userId },
  });

  return reply.send({
    averageScore: aggregation._avg.score || 0,
    totalRatings: aggregation._count.id,
    ratings,
  });
}
