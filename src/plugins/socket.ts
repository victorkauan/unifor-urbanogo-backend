import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import { Server } from "socket.io";
import { verifyToken } from "../lib/jwt.js";
import { registerRealtimeGateway, type RealtimeServer } from "../modules/realtime/realtime.gateway.js";

declare module "fastify" {
  interface FastifyInstance {
    io: RealtimeServer;
  }
}

export const socketPlugin = fp(
  async (app) => {
    const io: RealtimeServer = new Server(app.server, {
      cors: { origin: "*" },
    });

    io.use((socket, next) => {
      const connectionId = randomUUID();
      socket.data.connectionId = connectionId;

      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        app.log.warn({ connectionId }, "socket handshake rejeitado: token ausente");
        next(new Error("unauthorized"));
        return;
      }

      try {
        const { sub } = verifyToken(token);
        socket.data.userId = sub;
        socket.data.log = app.log.child({ connectionId, userId: sub });
        next();
      } catch {
        app.log.warn({ connectionId }, "socket handshake rejeitado: token inválido");
        next(new Error("unauthorized"));
      }
    });

    registerRealtimeGateway(io, app.redis);

    app.decorate("io", io);

    app.addHook("onClose", async () => {
      await io.close();
    });
  },
  { name: "socket" },
);
