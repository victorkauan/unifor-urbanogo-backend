import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { positionUpdateLatency } from "../../lib/metrics.js";
import { findActiveRideIdForDriver } from "./ride-tracking.repo.js";
import { rideRoom, type RealtimeServer } from "./realtime.gateway.js";
import type { DriverLocationEvent } from "./realtime.schema.js";

/**
 * Rede de segurança independente do throttle de 5s do app (ADR 0002): evita
 * inundar a sala em reconexões, retries duplicados ou múltiplos dispositivos.
 */
const SERVER_BROADCAST_THROTTLE_MS = 2_000;

/**
 * Metade do intervalo de envio real (5s, ADR 0002): preenche o meio do
 * caminho com um ponto por dead reckoning até a próxima leitura real chegar.
 */
const PREDICTED_FOLLOWUP_DELAY_MS = 2_500;

const EARTH_RADIUS_METERS = 6_371_000;

interface RideDriverLocationEvent {
  ride_id: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  recorded_at: string;
  predicted: boolean;
}

interface RideTrackingState {
  lastBroadcastAt: number;
  predictedTimeout?: NodeJS.Timeout;
}

export interface PositionTrackerOptions {
  throttleMs?: number;
  predictedDelayMs?: number;
}

export interface PositionTracker {
  handleDriverLocation(params: { userId: string; location: DriverLocationEvent }): Promise<void>;
  stop(): void;
}

export function projectPosition(
  location: Pick<DriverLocationEvent, "lat" | "lng" | "heading" | "speed">,
  elapsedSeconds: number,
): { lat: number; lng: number } {
  const distanceMeters = (location.speed ?? 0) * elapsedSeconds;
  const headingRad = ((location.heading ?? 0) * Math.PI) / 180;

  const deltaLat =
    ((distanceMeters * Math.cos(headingRad)) / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const deltaLng =
    ((distanceMeters * Math.sin(headingRad)) /
      (EARTH_RADIUS_METERS * Math.cos((location.lat * Math.PI) / 180))) *
    (180 / Math.PI);

  return { lat: location.lat + deltaLat, lng: location.lng + deltaLng };
}

export function createPositionTracker(
  io: RealtimeServer,
  prisma: PrismaClient,
  log: FastifyBaseLogger,
  options: PositionTrackerOptions = {},
): PositionTracker {
  const throttleMs = options.throttleMs ?? SERVER_BROADCAST_THROTTLE_MS;
  const predictedDelayMs = options.predictedDelayMs ?? PREDICTED_FOLLOWUP_DELAY_MS;
  const rideState = new Map<string, RideTrackingState>();

  function broadcast(rideId: string, location: DriverLocationEvent, predicted: boolean) {
    const payload: RideDriverLocationEvent = {
      ride_id: rideId,
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      speed: location.speed,
      recorded_at: location.recorded_at,
      predicted,
    };
    io.to(rideRoom(rideId)).emit("ride:driver_location", payload);
  }

  function scheduleDeadReckoning(
    rideId: string,
    location: DriverLocationEvent,
  ): NodeJS.Timeout | undefined {
    if (location.heading === undefined || location.speed === undefined || location.speed <= 0) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      const projected = projectPosition(location, predictedDelayMs / 1000);
      const projectedRecordedAt = new Date(
        Date.parse(location.recorded_at) + predictedDelayMs,
      ).toISOString();
      broadcast(rideId, { ...location, ...projected, recorded_at: projectedRecordedAt }, true);
    }, predictedDelayMs);
    timeout.unref();

    return timeout;
  }

  return {
    async handleDriverLocation({ userId, location }) {
      const rideId = await findActiveRideIdForDriver(prisma, userId);
      if (!rideId) {
        return;
      }

      const now = Date.now();
      const state = rideState.get(rideId);
      if (state && now - state.lastBroadcastAt < throttleMs) {
        return;
      }

      broadcast(rideId, location, false);
      const latencyMs = now - Date.parse(location.recorded_at);
      positionUpdateLatency.observe(latencyMs / 1000);
      log.info({ rideId, latencyMs }, "posição consolidada enviada para a sala da corrida");

      if (state?.predictedTimeout) {
        clearTimeout(state.predictedTimeout);
      }
      const predictedTimeout = scheduleDeadReckoning(rideId, location);
      rideState.set(rideId, { lastBroadcastAt: now, predictedTimeout });
    },
    stop() {
      for (const state of rideState.values()) {
        if (state.predictedTimeout) {
          clearTimeout(state.predictedTimeout);
        }
      }
      rideState.clear();
    },
  };
}
