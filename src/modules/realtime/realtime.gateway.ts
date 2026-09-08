import type { FastifyBaseLogger } from "fastify";
import type { Server, Socket } from "socket.io";
import { rideRoomEventSchema } from "./realtime.schema.js";

export interface RealtimeSocketData {
  connectionId: string;
  userId: string;
  log: FastifyBaseLogger;
}

export type RealtimeServer = Server;

export type RealtimeSocket = Socket;

export function rideRoom(rideId: string): string {
  return `ride:${rideId}`;
}

function socketData(socket: RealtimeSocket): RealtimeSocketData {
  return socket.data as RealtimeSocketData;
}

function emitInvalidPayload(socket: RealtimeSocket, event: string) {
  socketData(socket).log.warn({ event }, "payload de socket inválido");
  socket.emit("error", { code: "invalid_payload", message: "ride_id inválido ou ausente" });
}

export function registerRealtimeGateway(io: RealtimeServer) {
  io.on("connection", (socket: RealtimeSocket) => {
    const log = socketData(socket).log;
    log.info("socket conectado");

    socket.on("ride:join", (payload: unknown) => {
      const parsed = rideRoomEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket, "ride:join");
        return;
      }
      void socket.join(rideRoom(parsed.data.ride_id));
      log.child({ rideId: parsed.data.ride_id }).info("entrou na sala da corrida");
    });

    socket.on("ride:leave", (payload: unknown) => {
      const parsed = rideRoomEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket, "ride:leave");
        return;
      }
      void socket.leave(rideRoom(parsed.data.ride_id));
      log.child({ rideId: parsed.data.ride_id }).info("saiu da sala da corrida");
    });

    socket.on("disconnect", (reason) => {
      log.info({ reason }, "socket desconectado");
    });
  });
}
