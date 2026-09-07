import type { Server, Socket } from "socket.io";
import { rideRoomEventSchema } from "./realtime.schema.js";

export interface RealtimeSocketData {
  userId: string;
}

export type RealtimeServer = Server;

export type RealtimeSocket = Socket;

export function rideRoom(rideId: string): string {
  return `ride:${rideId}`;
}

function emitInvalidPayload(socket: RealtimeSocket) {
  socket.emit("error", { code: "invalid_payload", message: "ride_id inválido ou ausente" });
}

export function registerRealtimeGateway(io: RealtimeServer) {
  io.on("connection", (socket: RealtimeSocket) => {
    socket.on("ride:join", (payload: unknown) => {
      const parsed = rideRoomEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket);
        return;
      }
      void socket.join(rideRoom(parsed.data.ride_id));
    });

    socket.on("ride:leave", (payload: unknown) => {
      const parsed = rideRoomEventSchema.safeParse(payload);
      if (!parsed.success) {
        emitInvalidPayload(socket);
        return;
      }
      void socket.leave(rideRoom(parsed.data.ride_id));
    });
  });
}
