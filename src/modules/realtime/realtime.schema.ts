import { z } from "zod";

export const rideRoomEventSchema = z.object({
  ride_id: z.string().uuid(),
});

export type RideRoomEvent = z.infer<typeof rideRoomEventSchema>;
