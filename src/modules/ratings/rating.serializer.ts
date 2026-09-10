import type { Rating } from "@prisma/client";

type SerializableRating = Pick<
  Rating,
  "id" | "rideId" | "raterId" | "rateeId" | "score" | "comment" | "createdAt"
>;

export function serializeRating(rating: SerializableRating) {
  return {
    id: rating.id,
    ride_id: rating.rideId,
    rater_id: rating.raterId,
    ratee_id: rating.rateeId,
    score: rating.score,
    comment: rating.comment,
    created_at: rating.createdAt.toISOString(),
  };
}
