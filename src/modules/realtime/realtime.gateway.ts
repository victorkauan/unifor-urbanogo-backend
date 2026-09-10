import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { Server, Socket } from "socket.io";
import { recordDriverPresence } from "./demand-signal.repo.js";
import { saveDriverLocation, upsertDriverLocation } from "./driver-location.repo.js";
import type { PositionTracker } from "./position-tracker.js";
import { driverLocationEventSchema, rideRoomEventSchema } from "./realtime.schema.js";

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

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

function socketData(socket: RealtimeSocket): RealtimeSocketData {
  return socket.data as RealtimeSocketData;
}

function emitInvalidPayload(socket: RealtimeSocket, event: string, message: string) {
  socketData(socket).log.warn({ event }, "payload de socket inválido");
  socket.emit("error", { code: "invalid_payload", message });
}

export function registerRealtimeGateway(
  io: RealtimeServer,
  redis: Redis,
  prisma: PrismaClient,
  tracker: PositionTracker,
) {
  io.on("connection", (socket: RealtimeSocket) => {
    const { log, userId } = socketData(socket);
    void socket.join(userRoom(userId));
    log.info("socket conectado");

    socket.on("ride:join", (payload: unknown, ack?: (result: { ok: boolean }) => void) => {
      const parsed = rideRoomEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket, "ride:join", "ride_id inválido ou ausente");
        ack?.({ ok: false });
        return;
      }
      void Promise.resolve(socket.join(rideRoom(parsed.data.ride_id))).then(() => {
        log.child({ rideId: parsed.data.ride_id }).info("entrou na sala da corrida");
        ack?.({ ok: true });
      });
    });

    socket.on("ride:leave", (payload: unknown, ack?: (result: { ok: boolean }) => void) => {
      const parsed = rideRoomEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket, "ride:leave", "ride_id inválido ou ausente");
        ack?.({ ok: false });
        return;
      }
      void Promise.resolve(socket.leave(rideRoom(parsed.data.ride_id))).then(() => {
        log.child({ rideId: parsed.data.ride_id }).info("saiu da sala da corrida");
        ack?.({ ok: true });
      });
    });

    socket.on("driver:location", (payload: unknown) => {
      const parsed = driverLocationEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket, "driver:location", "payload de posição inválido");
        return;
      }
      Promise.all([
        saveDriverLocation(redis, userId, parsed.data),
        recordDriverPresence(redis, userId, parsed.data),
        upsertDriverLocation(prisma, userId, parsed.data),
      ])
        .then(() => {
          log.debug({ lat: parsed.data.lat, lng: parsed.data.lng }, "posição do motorista gravada");
          return tracker.handleDriverLocation({ userId, location: parsed.data });
        })
        .catch((err: unknown) => {
          log.error({ err }, "falha ao processar posição do motorista");
        });
    });

    socket.on("disconnect", (reason) => {
      log.info({ reason }, "socket desconectado");
    });
  });
}
