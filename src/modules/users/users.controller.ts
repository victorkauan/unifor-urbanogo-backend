import type { FastifyReply, FastifyRequest } from "fastify";
import { authUserId } from "../auth/auth-user.js";
import { serializeUser } from "./user.serializer.js";

interface UpdateMeBody {
  name?: string;
  phone?: string;
}

async function currentUser(req: FastifyRequest) {
  const userId = authUserId(req);
  if (!userId) {
    return null;
  }
  return req.server.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
}

export async function getMe(req: FastifyRequest, reply: FastifyReply) {
  const user = await currentUser(req);
  if (!user) {
    return reply.fail(401, "Não autenticado");
  }
  return reply.ok({ user: serializeUser(user) }, "Perfil do usuário");
}

export async function updateMe(req: FastifyRequest, reply: FastifyReply) {
  const user = await currentUser(req);
  if (!user) {
    return reply.fail(401, "Não autenticado");
  }

  const { name, phone } = req.body as UpdateMeBody;
  const updated = await req.server.prisma.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      updatedById: user.id,
    },
  });

  return reply.ok({ user: serializeUser(updated) }, "Perfil atualizado");
}

export async function deleteMe(req: FastifyRequest, reply: FastifyReply) {
  const user = await currentUser(req);
  if (!user) {
    return reply.fail(401, "Não autenticado");
  }

  await req.server.prisma.user.update({
    where: { id: user.id },
    data: { deletedAt: new Date(), deletedById: user.id },
  });

  return reply.ok(null, "Conta removida");
}
