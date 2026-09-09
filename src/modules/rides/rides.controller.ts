import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma, RideStatus } from "@prisma/client";
import { authUserId } from "../auth/auth-user.js";
import { haversineKm } from "../../lib/geo.js";
import { rideDuration } from "../../lib/metrics.js";
import { createSocketMatchingNotifier } from "../matching/matching.notifier.js";
import { calculateFare } from "../pricing/pricing.service.js";
import { recordRideRequest } from "../realtime/demand-signal.repo.js";
import { rideResponseInclude, serializeRide, type RideForResponse } from "./ride.serializer.js";
import { assertRideTransition, isTerminalRideStatus } from "./ride-state-machine.js";

const ACTIVE_RIDE_STATUSES = ["requested", "searching", "assigned", "in_progress"] as const;

function broadcastRideStatus(req: FastifyRequest, ride: RideForResponse) {
  createSocketMatchingNotifier(req.server.io).statusToRide(ride.id, {
    ride_id: ride.id,
    status: ride.status,
    driver: ride.driver
      ? {
          id: ride.driver.id,
          name: ride.driver.user.name,
          vehicle_model: ride.driver.vehicleModel,
          vehicle_plate: ride.driver.vehiclePlate,
        }
      : undefined,
    arrived_at: ride.arrivedAt?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  });
}

async function requireAssignedDriverRide(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    reply.fail(401, "Não autenticado");
    return null;
  }

  const { rideId } = req.params as { rideId: string };
  const ride = await req.server.prisma.ride.findUnique({
    where: { id: rideId },
    include: { driver: { select: { userId: true } } },
  });
  if (!ride) {
    reply.fail(404, "Corrida não encontrada");
    return null;
  }
  if (ride.driver?.userId !== userId) {
    reply.fail(403, "Você não é o motorista desta corrida");
    return null;
  }

  return { userId, ride };
}

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

  void recordRideRequest(req.server.redis, origin).catch((err: unknown) => {
    req.log.error({ err, rideId: created.id }, "falha ao registrar sinal de demanda");
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

  broadcastRideStatus(req, full);

  req.log.info({ rideId, cancelledBy, reason }, "corrida cancelada");
  return reply.ok({ ride: serializeRide(full) }, "Corrida cancelada");
}

export async function arriveRide(req: FastifyRequest, reply: FastifyReply) {
  const found = await requireAssignedDriverRide(req, reply);
  if (!found) {
    return;
  }
  const { ride } = found;

  if (ride.status !== "assigned") {
    return reply.fail(409, "A corrida precisa estar atribuída para marcar chegada", {
      status: ride.status,
    });
  }
  if (ride.arrivedAt) {
    return reply.fail(409, "Chegada já registrada");
  }

  await req.server.prisma.ride.update({
    where: { id: ride.id },
    data: { arrivedAt: new Date(), updatedById: found.userId },
  });

  const full = await req.server.prisma.ride.findUniqueOrThrow({
    where: { id: ride.id },
    include: rideResponseInclude,
  });
  broadcastRideStatus(req, full);

  req.log.info({ rideId: ride.id }, "motorista chegou na origem");
  return reply.ok({ ride: serializeRide(full) }, "Chegada registrada");
}

export async function startRide(req: FastifyRequest, reply: FastifyReply) {
  const found = await requireAssignedDriverRide(req, reply);
  if (!found) {
    return;
  }
  const { ride } = found;

  if (!ride.arrivedAt) {
    return reply.fail(409, "O motorista precisa marcar chegada antes de iniciar a corrida");
  }
  assertRideTransition(ride.status, "in_progress");

  await req.server.prisma.ride.update({
    where: { id: ride.id },
    data: { status: "in_progress", startedAt: new Date(), updatedById: found.userId },
  });

  const full = await req.server.prisma.ride.findUniqueOrThrow({
    where: { id: ride.id },
    include: rideResponseInclude,
  });
  broadcastRideStatus(req, full);

  req.log.info({ rideId: ride.id }, "corrida iniciada");
  return reply.ok({ ride: serializeRide(full) }, "Corrida iniciada");
}

export async function completeRide(req: FastifyRequest, reply: FastifyReply) {
  const found = await requireAssignedDriverRide(req, reply);
  if (!found) {
    return;
  }
  const { ride } = found;

  assertRideTransition(ride.status, "completed");

  const completedAt = new Date();
  await req.server.prisma.ride.update({
    where: { id: ride.id },
    data: { status: "completed", completedAt, updatedById: found.userId },
  });

  if (ride.startedAt) {
    rideDuration.observe((completedAt.getTime() - ride.startedAt.getTime()) / 1000);
  }

  const full = await req.server.prisma.ride.findUniqueOrThrow({
    where: { id: ride.id },
    include: rideResponseInclude,
  });
  broadcastRideStatus(req, full);

  req.log.info({ rideId: ride.id }, "corrida concluída");
  return reply.ok({ ride: serializeRide(full) }, "Corrida concluída");
}
