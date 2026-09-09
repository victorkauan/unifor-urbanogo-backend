import type { FastifyReply, FastifyRequest } from "fastify";
import { authUserId } from "../auth/auth-user.js";
import { serializeDriver } from "./driver.serializer.js";

interface CreateDriverBody {
  service_preference: "rides" | "deliveries" | "both";
  vehicle_model?: string;
  vehicle_plate?: string;
}

interface UpdateDriverBody {
  service_preference?: "rides" | "deliveries" | "both";
  vehicle_model?: string;
  vehicle_plate?: string;
}

export async function getMe(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const driver = await req.server.prisma.driver.findFirst({ where: { userId, deletedAt: null } });
  if (!driver) {
    return reply.fail(404, "Perfil de motorista não encontrado");
  }

  return reply.ok({ driver: serializeDriver(driver) }, "Perfil do motorista");
}

export async function createMe(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const body = req.body as CreateDriverBody;
  const existing = await req.server.prisma.driver.findFirst({ where: { userId, deletedAt: null } });
  if (existing) {
    return reply.fail(409, "Perfil de motorista já existe");
  }

  const driver = await req.server.prisma.driver.create({
    data: {
      userId,
      servicePreference: body.service_preference,
      vehicleModel: body.vehicle_model ?? null,
      vehiclePlate: body.vehicle_plate ?? null,
      createdById: userId,
    },
  });

  return reply.ok({ driver: serializeDriver(driver) }, "Perfil de motorista criado", 201);
}

export async function updateMe(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const body = req.body as UpdateDriverBody;
  const driver = await req.server.prisma.driver.findFirst({ where: { userId, deletedAt: null } });
  if (!driver) {
    return reply.fail(404, "Perfil de motorista não encontrado");
  }

  const updated = await req.server.prisma.driver.update({
    where: { id: driver.id },
    data: {
      ...(body.service_preference !== undefined
        ? { servicePreference: body.service_preference }
        : {}),
      ...(body.vehicle_model !== undefined ? { vehicleModel: body.vehicle_model } : {}),
      ...(body.vehicle_plate !== undefined ? { vehiclePlate: body.vehicle_plate } : {}),
      updatedById: userId,
    },
  });

  return reply.ok({ driver: serializeDriver(updated) }, "Perfil de motorista atualizado");
}
