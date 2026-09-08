import type { FastifyReply, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type UpdateProfileBody = {
  name?: string;
  phone?: string;
};

export async function getProfile(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req as FastifyRequest & { user?: { id: string } }).user?.id;

  if (!userId) {
    return reply.fail(401, "User not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    return reply.fail(404, "User not found");
  }

  return reply.send(user);
}

export async function updateProfile(
  req: FastifyRequest<{ Body: UpdateProfileBody }>,
  reply: FastifyReply,
) {
  const userId = (req as FastifyRequest & { user?: { id: string } }).user?.id;
  const { name, phone } = req.body;

  if (!userId) {
    return reply.fail(401, "User not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    return reply.fail(404, "User not found");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(phone !== undefined && { phone }),
      updatedById: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
    },
  });

  return reply.send(updatedUser);
}

export async function deleteProfile(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req as FastifyRequest & { user?: { id: string } }).user?.id;

  if (!userId) {
    return reply.fail(401, "User not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    return reply.fail(404, "User not found");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      deletedById: userId,
    },
  });

  return reply.status(204).send();
}
