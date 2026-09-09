import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string; sub: string };
  }
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const token = BEARER_PATTERN.exec(header.trim())?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export async function verifyJwt(req: FastifyRequest, reply: FastifyReply) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return reply.fail(401, "Token não informado");
  }

  try {
    const { sub } = verifyToken(token);
    req.user = { id: sub, sub };
  } catch {
    return reply.fail(401, "Token inválido ou expirado");
  }
}
