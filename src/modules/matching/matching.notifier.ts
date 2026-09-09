import { rideRoom, userRoom, type RealtimeServer } from "../realtime/realtime.gateway.js";

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface MatchingOfferPayload {
  offer_id: string;
  ride_id: string;
  expires_at: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  passenger: { name: string; trust_score: number };
  distance_to_pickup_meters: number;
  price_cents: number | null;
}

export interface RideStatusPayload {
  ride_id: string;
  status: string;
  driver?: { id: string; name: string; vehicle_model: string | null; vehicle_plate: string | null };
  arrived_at?: string | null;
  updated_at: string;
}

export interface MatchingNotifier {
  offerToDriver(driverUserId: string, payload: MatchingOfferPayload): void;
  cancelToRide(rideId: string, reason: string): void;
  statusToRide(rideId: string, payload: RideStatusPayload): void;
}

export function createSocketMatchingNotifier(io: RealtimeServer): MatchingNotifier {
  return {
    offerToDriver(driverUserId, payload) {
      io.to(userRoom(driverUserId)).emit("matching:offer", payload);
    },
    cancelToRide(rideId, reason) {
      io.to(rideRoom(rideId)).emit("matching:cancelled", { ride_id: rideId, reason });
    },
    statusToRide(rideId, payload) {
      io.to(rideRoom(rideId)).emit("ride:status", payload);
    },
  };
}
