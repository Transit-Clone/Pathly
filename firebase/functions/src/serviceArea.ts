/**
 * The app's service area: NYC, Nassau, and Suffolk as one rectangle. Mirrors
 * mobile/src/data/serviceArea.ts (a test keeps the two identical).
 */
export const SERVICE_AREA_BOUNDS = {
  north: 41.2,
  south: 40.48,
  east: -71.85,
  west: -74.28,
};

export function isInServiceArea(lat: number, lng: number): boolean {
  return lat >= SERVICE_AREA_BOUNDS.south && lat <= SERVICE_AREA_BOUNDS.north && lng >= SERVICE_AREA_BOUNDS.west && lng <= SERVICE_AREA_BOUNDS.east;
}
