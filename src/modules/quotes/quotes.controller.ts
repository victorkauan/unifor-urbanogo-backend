import type { FastifyReply, FastifyRequest } from "fastify";
import type { LatLng } from "../../lib/geo.js";
import { authUserId } from "../auth/auth-user.js";
import { getDemandRatio } from "../realtime/demand-signal.repo.js";
import { quotePrice } from "./quote.service.js";

interface QuoteBody {
  type: "ride" | "delivery";
  origin: LatLng;
  destination: LatLng;
}

export async function createQuote(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const { origin, destination } = req.body as QuoteBody;
  const quote = await quotePrice(
    { origin, destination },
    { resolveDemandRatio: (point) => getDemandRatio(req.server.redis, point) },
  );

  return reply.ok(quote, "Cotação gerada");
}
