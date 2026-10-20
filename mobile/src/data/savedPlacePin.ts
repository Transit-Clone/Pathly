/**
 * The home map's saved-place pin: a round badge in the brand color over a short point at the place,
 * with the place's icon centered on the badge. The web map draws the badge from this SVG and the
 * icon as the marker's label; the native map draws the same shape from views
 * (GoogleMapView.native.tsx).
 */

/** Badge size and the point's length, in px; the marker's anchor is the point's tip. */
export const SAVED_PIN = { size: 34, point: 7 } as const;

/** Half the point's width where it meets the badge, in px. */
const POINT_HALF_WIDTH = 6;
const RING_WIDTH = 2.5;

/**
 * The empty pin as an SVG data URL: one outlined shape, the badge's circle running straight into
 * the point, so no ring crosses the pin where the two meet. The outline is in `ring`.
 */
export function savedPinSvgUrl(fill: string, ring: string): string {
  const { size, point } = SAVED_PIN;
  const r = size / 2;
  const height = size + point;
  const radius = r - RING_WIDTH / 2;
  // Where the point's sides leave the circle, and its tip (kept inside the image with its stroke).
  const joinY = (r + Math.sqrt(radius * radius - POINT_HALF_WIDTH * POINT_HALF_WIDTH)).toFixed(2);
  const tipY = height - RING_WIDTH / 2;
  const outline = `M${r - POINT_HALF_WIDTH} ${joinY} A${radius} ${radius} 0 1 1 ${r + POINT_HALF_WIDTH} ${joinY} L${r} ${tipY} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">`
    + `<path d="${outline}" fill="${fill}" stroke="${ring}" stroke-width="${RING_WIDTH}" stroke-linejoin="round"/>`
    + '</svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export type PinPoint = { latitude: number; longitude: number };
export type StackedPin = { position: PinPoint; leader: boolean };

const METERS_PER_DEGREE = 111_320;

/** Ground meters one screen pixel covers on a Google (Web Mercator) map at `zoom`. */
export function metersPerPixelAtZoom(zoom: number, latitude: number): number {
  return (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/** Ground meters one screen pixel covers when `longitudeDelta` degrees span `widthPixels`. */
export function metersPerPixelForSpan(longitudeDelta: number, widthPixels: number, latitude: number): number {
  return (longitudeDelta * METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180)) / Math.max(1, widthPixels);
}

/**
 * Where to draw each pin at the map's scale: pins that would partly cover one another (closer on
 * screen than a badge is wide) are drawn at one spot, fully overlapping, so a zoomed-out cluster
 * reads as one pin rather than a tangle of rings. The first pin of each stack (in `points` order)
 * leads it: it's drawn on top, and the others' icons are left off. Zoomed in far enough to part
 * them, every pin stands at its own place again.
 */
export function stackSavedPins(points: readonly PinPoint[], metersPerPixel: number): StackedPin[] {
  const reachMeters = SAVED_PIN.size * metersPerPixel;
  const leaders: PinPoint[] = [];
  return points.map((point) => {
    const leader = leaders.find((candidate) => {
      const dy = (point.latitude - candidate.latitude) * METERS_PER_DEGREE;
      const dx = (point.longitude - candidate.longitude) * METERS_PER_DEGREE * Math.cos((candidate.latitude * Math.PI) / 180);
      return Math.hypot(dx, dy) < reachMeters;
    });
    if (leader) return { position: leader, leader: false };
    leaders.push(point);
    return { position: point, leader: true };
  });
}
