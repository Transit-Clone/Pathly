const EARTH_RADIUS_METERS = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points. */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
