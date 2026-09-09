import type { FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type UpdateDriverProfileBody = {
  servicePreference?: "rides" | "deliveries" | "both";
  vehicleModel?: string;
  vehiclePlate?: string;
};

export async function getProfile(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req as FastifyRequest & { user?: { id: string } }).user?.id;

  if (!userId) {
    return reply.fail(401, "User not authenticated");
  }

  const driver = await prisma.driver.findUnique({
    where: { userId },
    include: {
      user: {
        select: { name: true, email: true, phone: true },
      },
    },
  });

  if (!driver) {
    return reply.fail(404, "Driver profile not found");
  }

  return reply.send(driver);
}

export async function updateProfile(
  req: FastifyRequest<{ Body: UpdateDriverProfileBody }>,
  reply: FastifyReply,
) {
  const userId = (req as FastifyRequest & { user?: { id: string } }).user?.id;
  const { servicePreference, vehicleModel, vehiclePlate } = req.body;

  if (!userId) {
    return reply.fail(401, "User not authenticated");
  }

  const driver = await prisma.driver.findUnique({ where: { userId } });

  if (!driver) {
    return reply.fail(404, "Driver profile not found");
  }

  const updatedDriver = await prisma.driver.update({
    where: { userId },
    data: {
      ...(servicePreference && { servicePreference }),
      ...(vehicleModel && { vehicleModel }),
      ...(vehiclePlate && { vehiclePlate }),
    },
  });

  return reply.send(updatedDriver);
}
