import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string; sub: string };
  }
}

export async function verifyJwt(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return reply.fail(401, "Token não informado");
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { sub } = verifyToken(token);
    req.user = { id: sub, sub };
  } catch {
    return reply.fail(401, "Token inválido ou expirado");
  }
}
