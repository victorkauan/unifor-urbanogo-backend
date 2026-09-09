import type { FastifyReply, FastifyRequest } from "fastify";
import { authUserId } from "../auth/auth-user.js";
import { rideResponseInclude, serializeRide } from "../rides/ride.serializer.js";

function offerId(req: FastifyRequest): string {
  return (req.params as { offerId: string }).offerId;
}

export async function acceptOffer(req: FastifyRequest, reply: FastifyReply) {
  const driverUserId = authUserId(req);
  if (!driverUserId) {
    return reply.fail(401, "Não autenticado");
  }

  const accepted = await req.server.matching.handleAccept(offerId(req), driverUserId);
  const ride = await req.server.prisma.ride.findUniqueOrThrow({
    where: { id: accepted.id },
    include: rideResponseInclude,
  });

  return reply.ok({ ride: serializeRide(ride) }, "Corrida atribuída");
}

export async function rejectOffer(req: FastifyRequest, reply: FastifyReply) {
  const driverUserId = authUserId(req);
  if (!driverUserId) {
    return reply.fail(401, "Não autenticado");
  }

  await req.server.matching.handleReject(offerId(req), driverUserId);
  return reply.ok(null, "Oferta recusada");
}
