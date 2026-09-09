import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma, RideStatus } from "@prisma/client";
import { authUserId } from "../auth/auth-user.js";
import { haversineKm } from "../../lib/geo.js";
import { createSocketMatchingNotifier } from "../matching/matching.notifier.js";
import { calculateFare } from "../pricing/pricing.service.js";
import { rideResponseInclude, serializeRide } from "./ride.serializer.js";
import { assertRideTransition, isTerminalRideStatus } from "./ride-state-machine.js";

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

export async function listRides(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const query = req.query as {
    role?: "passenger" | "driver";
    status?: RideStatus;
    page: number;
    page_size: number;
  };

  const where: Prisma.RideWhereInput = {};
  if (query.role === "driver") {
    where.driver = { userId };
  } else if (query.role === "passenger") {
    where.passengerId = userId;
  } else {
    where.OR = [{ passengerId: userId }, { driver: { userId } }];
  }
  if (query.status) {
    where.status = query.status;
  }

  const [total, rides] = await req.server.prisma.$transaction([
    req.server.prisma.ride.count({ where }),
    req.server.prisma.ride.findMany({
      where,
      include: rideResponseInclude,
      orderBy: { requestedAt: "desc" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    }),
  ]);

  return reply.ok(
    {
      items: rides.map((ride) => serializeRide(ride)),
      page: query.page,
      page_size: query.page_size,
      total,
    },
    "Corridas encontradas",
  );
}

export async function cancelRide(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const { rideId } = req.params as { rideId: string };
  const rawReason = (req.body ?? {}) as { reason?: unknown };
  const reason =
    typeof rawReason.reason === "string" ? rawReason.reason.trim().slice(0, 500) || null : null;

  const ride = await req.server.prisma.ride.findUnique({
    where: { id: rideId },
    include: { driver: { select: { userId: true } } },
  });
  if (!ride) {
    return reply.fail(404, "Corrida não encontrada");
  }

  const isPassenger = ride.passengerId === userId;
  const isAssignedDriver = ride.driver?.userId === userId;
  if (!isPassenger && !isAssignedDriver) {
    return reply.fail(403, "Você não faz parte desta corrida");
  }

  if (isTerminalRideStatus(ride.status)) {
    return reply.fail(409, "Esta corrida já foi finalizada");
  }

  const cancelledBy: "passenger" | "driver" = isPassenger ? "passenger" : "driver";
  if (cancelledBy === "driver" && ride.status !== "assigned" && ride.status !== "in_progress") {
    return reply.fail(403, "O motorista só pode cancelar uma corrida atribuída");
  }

  if (ride.status === "searching") {
    await req.server.matching.cancel(rideId, cancelledBy, reason);
  } else {
    assertRideTransition(ride.status, "cancelled");
    await req.server.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: "cancelled",
        cancelledBy,
        cancelledAt: new Date(),
        cancelledReason: reason,
        updatedById: userId,
      },
    });
  }

  const full = await req.server.prisma.ride.findUniqueOrThrow({
    where: { id: rideId },
    include: rideResponseInclude,
  });

  createSocketMatchingNotifier(req.server.io).statusToRide(rideId, {
    ride_id: rideId,
    status: full.status,
    driver: full.driver
      ? {
          id: full.driver.id,
          name: full.driver.user.name,
          vehicle_model: full.driver.vehicleModel,
          vehicle_plate: full.driver.vehiclePlate,
        }
      : undefined,
    updated_at: new Date().toISOString(),
  });

  req.log.info({ rideId, cancelledBy, reason }, "corrida cancelada");
  return reply.ok({ ride: serializeRide(full) }, "Corrida cancelada");
}
