const KM_PER_DEGREE_LAT = 111;

/** Ponto aleatório a até radiusKm do centro (aproximação equirretangular, suficiente pra teste de carga). */
export function jitter(center, radiusKm = 1) {
  const dLat = (Math.random() - 0.5) * 2 * (radiusKm / KM_PER_DEGREE_LAT);
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180);
  const dLng = (Math.random() - 0.5) * 2 * (radiusKm / kmPerDegreeLng);
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}
