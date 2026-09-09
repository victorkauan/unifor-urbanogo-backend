export interface RankableCandidate {
  driverId: string;
  userId: string;
  distanceKm: number;
  trust: number;
}

export function normalizeTrust(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 0.5;
  }
  const scaled = raw > 1 ? (raw - 1) / 4 : raw;
  return Math.min(1, Math.max(0, scaled));
}

export function candidateRank(candidate: RankableCandidate, tradeoffKm: number): number {
  return candidate.distanceKm + tradeoffKm * (1 - candidate.trust);
}

export function rankCandidates<T extends RankableCandidate>(
  candidates: readonly T[],
  tradeoffKm: number,
): T[] {
  return [...candidates].sort(
    (a, b) => candidateRank(a, tradeoffKm) - candidateRank(b, tradeoffKm),
  );
}
