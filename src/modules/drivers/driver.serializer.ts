import type { Driver } from "@prisma/client";

type SerializableDriver = Pick<
  Driver,
  "id" | "userId" | "servicePreference" | "isOnline" | "vehicleModel" | "vehiclePlate" | "createdAt"
>;

export function serializeDriver(driver: SerializableDriver) {
  return {
    id: driver.id,
    user_id: driver.userId,
    service_preference: driver.servicePreference,
    is_online: driver.isOnline,
    vehicle_model: driver.vehicleModel,
    vehicle_plate: driver.vehiclePlate,
    created_at: driver.createdAt.toISOString(),
  };
}
