import type { User } from "@prisma/client";

type SerializableUser = Pick<User, "id" | "name" | "email" | "phone" | "role" | "createdAt">;

export function serializeUser(user: SerializableUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    created_at: user.createdAt.toISOString(),
  };
}
