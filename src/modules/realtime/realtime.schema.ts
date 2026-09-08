import { z } from "zod";

export const rideRoomEventSchema = z.object({
  ride_id: z.string().uuid(),
});

export type RideRoomEvent = z.infer<typeof rideRoomEventSchema>;

export const driverLocationEventSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  accuracy: z.number().min(0).optional(),
  recorded_at: z.string().datetime(),
});

export type DriverLocationEvent = z.infer<typeof driverLocationEventSchema>;
