/**
 * Rectangular bounding box covering NYC's five boroughs, Nassau County, and Suffolk
 * County (Montauk to the Bronx/North Fork). A rectangle is necessarily an approximation
 * of these counties' actual shapes — it also includes slivers of NJ/CT/the Sound/ocean
 * that fall inside the box. This is the transit/search coverage boundary; the map's
 * camera uses the larger MAP_EXPLORATION_BOUNDS below.
 */
export const SERVICE_AREA_BOUNDS = {
  north: 41.2,
  south: 40.48,
  east: -71.85,
  west: -74.28,
};

/** Room to browse neighboring areas without changing route/search coverage. */
export const MAP_EXPLORATION_BOUNDS = {
  north: 41.65,
  south: 40.1,
  east: -71.4,
  west: -74.9,
};

/** Default map center before the user's real location is known or if permission is denied. */
export const SERVICE_AREA_FALLBACK = { latitude: 40.9157, longitude: -73.124 };
