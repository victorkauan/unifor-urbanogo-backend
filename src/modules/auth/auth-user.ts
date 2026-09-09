import type { FastifyRequest } from "fastify";

export function authUserId(req: FastifyRequest): string | null {
  const user = req.user;
  if (!user || typeof user === "string") {
    return null;
  }
  const id = (user as { id?: unknown }).id;
  const sub = (user as { sub?: unknown }).sub;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  if (typeof sub === "string" && sub.length > 0) {
    return sub;
  }
  return null;
}
