export interface MatchingConfig {
  searchRadiusKm: number;
  maxCandidates: number;
  offerTimeoutMs: number;
  globalTimeoutMs: number;
  distanceTrustTradeoffKm: number;
  stateTtlSeconds: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  searchRadiusKm: 5,
  maxCandidates: 10,
  offerTimeoutMs: 15_000,
  globalTimeoutMs: 60_000,
  distanceTrustTradeoffKm: 2,
  stateTtlSeconds: 120,
};
