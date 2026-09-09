export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const EARTH_RADIUS_KM = 6371;

const DEG_TO_RAD = Math.PI / 180;
const KM_PER_DEGREE_LAT = 111.045;

export function haversineKm(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function boundingBox(center: LatLng, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos(center.lat * DEG_TO_RAD);
  const lngDelta = cosLat > 1e-9 ? radiusKm / (KM_PER_DEGREE_LAT * cosLat) : 180;
  return {
    minLat: Math.max(-90, center.lat - latDelta),
    maxLat: Math.min(90, center.lat + latDelta),
    minLng: Math.max(-180, center.lng - lngDelta),
    maxLng: Math.min(180, center.lng + lngDelta),
  };
}
