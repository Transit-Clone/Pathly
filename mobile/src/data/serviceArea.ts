/**
 * Rectangular bounding box covering NYC's five boroughs, Nassau County, and Suffolk
 * County (Montauk to the Bronx/North Fork). A rectangle is necessarily an approximation
 * of these counties' actual shapes — it also includes slivers of NJ/CT/the Sound/ocean
 * that fall inside the box. Matches what both Google Maps' own `restriction` option
 * (web) and a manual pan-clamp (native) can express; a precise multi-polygon clip would
 * need a custom overlay mask, which isn't worth it for this use case.
 */
export const SERVICE_AREA_BOUNDS = {
  north: 41.2,
  south: 40.48,
  east: -71.85,
  west: -74.28,
};

/** Default map center before the user's real location is known or if permission is denied. */
export const SERVICE_AREA_FALLBACK = { latitude: 40.9157, longitude: -73.124 };
