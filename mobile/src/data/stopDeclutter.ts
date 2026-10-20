/**
 * When a map's stop dots are spaced out enough to draw: from far away a line's stops pile on top
 * of each other, so they're hidden until the map is zoomed in far enough that nearly every stop
 * sits clear of its nearest neighbor. Shared by the route and trip maps, web and native.
 */

type Point = { lat: number; lng: number };

/** Gap needed between neighboring dots' centers, in screen pixels. */
const MIN_SPACING_PX = 11;
/** Share of stops that must have that gap; a few bunched-up pairs (a loop, a terminal) don't hold the rest back. */
const CLEAR_SHARE = 0.8;
/** From this many stops on, one bunched-up pair never holds the rest back. */
const LENIENT_FROM_STOPS = 5;
/** Stops closer than this are the same place listed twice, not clutter. */
const SAME_PLACE_METERS = 3;
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;
const TILE_PX = 256;

function metersBetween(a: Point, b: Point): number {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lng - a.lng) * Math.cos(meanLat);
  const dy = b.lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy) * (EARTH_CIRCUMFERENCE_METERS / 360);
}

/**
 * The lowest zoom (Google's web scale: 2^zoom × 256 px around the world) at which the stops are
 * clear of each other. 0 for fewer than two distinct stops.
 */
export function stopRevealZoom(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  const nearest: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const meters = metersBetween(points[i]!, points[j]!);
      if (meters >= SAME_PLACE_METERS && meters < best) best = meters;
    }
    if (best !== Infinity) nearest.push(best);
  }
  if (nearest.length === 0) return 0;
  nearest.sort((a, b) => a - b);
  // The gap that CLEAR_SHARE of the stops have at least; on a line of a few stops, one close pair
  // (both its stops count as close) doesn't hide the others.
  const skipped = Math.floor(nearest.length * (1 - CLEAR_SHARE));
  const gap = nearest[Math.min(nearest.length - 1, nearest.length >= LENIENT_FROM_STOPS ? Math.max(2, skipped) : skipped)]!;
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const metersPerPxAtZoom0 = (EARTH_CIRCUMFERENCE_METERS * Math.cos(lat * (Math.PI / 180))) / TILE_PX;
  return Math.log2((MIN_SPACING_PX * metersPerPxAtZoom0) / gap);
}

/** A native map region's zoom on the same scale as Google's web zoom, from its width. */
export function zoomForRegion(longitudeDelta: number, widthPx: number): number {
  if (longitudeDelta <= 0 || widthPx <= 0) return 0;
  return Math.log2((360 * widthPx) / (TILE_PX * longitudeDelta));
}
