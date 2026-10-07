export type LatLon = { lat: number; lon: number };

const METERS_PER_DEGREE = 111_320;

/** Approximate distance in meters; plenty accurate at a route's scale. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.hypot(x, y) * METERS_PER_DEGREE;
}

/** Compass bearing from `a` to `b`, in degrees clockwise from north (0–360). */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function nearestIndex(path: readonly LatLon[], point: LatLon, from = 0, to = path.length - 1): number {
  let best = from;
  let bestDistance = Infinity;
  for (let index = from; index <= to; index += 1) {
    const distance = distanceMeters(path[index]!, point);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The index of the `path` point at the stop `stops[stopIndex]`, where the line is split into the
 * part behind the rider and the part ahead. `path` and `stops` are both in travel order. The
 * search is limited to the stretch between the neighboring stops, so a line that passes near the
 * same stop twice (a loop) still splits at the right pass.
 */
export function splitIndexAtStop(path: readonly LatLon[], stops: readonly LatLon[], stopIndex: number): number {
  if (path.length === 0) return 0;
  const last = path.length - 1;
  const from = stopIndex > 0 ? nearestIndex(path, stops[stopIndex - 1]!) : 0;
  const to = stopIndex < stops.length - 1 ? nearestIndex(path, stops[stopIndex + 1]!, from) : last;
  return nearestIndex(path, stops[stopIndex]!, from, Math.max(from, to));
}

/**
 * Which way the direction arrow beside the rider's stop points: straight at the next stop in this
 * direction. Following the track itself misleads here — lines often curve right at a station (on
 * the Port Jefferson Branch, up to ~50° off the way the train is actually heading), and station
 * markers can sit a couple of hundred meters off the track. Null at the end of the line.
 */
export function bearingToNextStop(stops: readonly LatLon[], stopIndex: number): number | null {
  const stop = stops[stopIndex];
  const next = stops[stopIndex + 1];
  return stop && next ? bearingDegrees(stop, next) : null;
}

/** `#RRGGBB` with an alpha channel (0–1); other color formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}`;
}
