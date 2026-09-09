import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

// Expande a interface original do Fastify para incluir a propriedade 'user'
declare module "fastify" {
  interface FastifyRequest {
    user?: string | jwt.JwtPayload;
  }
}

export async function verifyJwt(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return reply.fail(401, "Token not provided");
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded;
  } catch {
    return reply.fail(401, "Invalid or expired token");
  }
}
