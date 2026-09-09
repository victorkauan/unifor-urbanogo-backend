import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { authUserId } from "../auth/auth-user.js";
import { haversineKm } from "../../lib/geo.js";
import { calculateFare } from "../pricing/pricing.service.js";
import { rideResponseInclude, serializeRide } from "./ride.serializer.js";

const ACTIVE_RIDE_STATUSES = ["requested", "searching", "assigned", "in_progress"] as const;

interface GeoPointInput {
  lat: number;
  lng: number;
  address?: string;
}

interface CreateRideBody {
  type: "ride" | "delivery";
  origin: GeoPointInput;
  destination: GeoPointInput;
}

export async function createRide(req: FastifyRequest, reply: FastifyReply) {
  const passengerId = authUserId(req);
  if (!passengerId) {
    return reply.fail(401, "Não autenticado");
  }

  const passenger = await req.server.prisma.user.findFirst({
    where: { id: passengerId, deletedAt: null },
    select: { id: true },
  });
  if (!passenger) {
    return reply.fail(401, "Conta inválida");
  }

  const activeRide = await req.server.prisma.ride.findFirst({
    where: { passengerId, status: { in: [...ACTIVE_RIDE_STATUSES] } },
    select: { id: true },
  });
  if (activeRide) {
    return reply.fail(409, "Você já tem uma corrida em andamento");
  }

  const { type, origin, destination } = req.body as CreateRideBody;

  const distanceMeters = Math.round(
    haversineKm(
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
    ) * 1000,
  );
  const fare = calculateFare({ distanceMeters });

  const created = await req.server.prisma.ride.create({
    data: {
      passengerId,
      type,
      status: "searching",
      originLat: origin.lat,
      originLng: origin.lng,
      originAddress: origin.address ?? null,
      destLat: destination.lat,
      destLng: destination.lng,
      destAddress: destination.address ?? null,
      distanceMeters,
      priceCents: fare.amount_cents,
      priceBreakdown: fare.breakdown as unknown as Prisma.InputJsonValue,
      createdById: passengerId,
    },
  });

  void req.server.matching.start(created.id).catch((err: unknown) => {
    req.log.error({ err, rideId: created.id }, "falha ao iniciar o matching");
  });

  const ride = await req.server.prisma.ride.findUniqueOrThrow({
    where: { id: created.id },
    include: rideResponseInclude,
  });

  return reply.ok({ ride: serializeRide(ride) }, "Corrida solicitada", 201);
}

export async function getRide(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const { rideId } = req.params as { rideId: string };
  const ride = await req.server.prisma.ride.findUnique({
    where: { id: rideId },
    include: rideResponseInclude,
  });
  if (!ride) {
    return reply.fail(404, "Corrida não encontrada");
  }

  const isPassenger = ride.passengerId === userId;
  const isAssignedDriver = ride.driver?.userId === userId;
  if (!isPassenger && !isAssignedDriver) {
    return reply.fail(403, "Você não faz parte desta corrida");
  }

  return reply.ok({ ride: serializeRide(ride) }, "Corrida encontrada");
}
