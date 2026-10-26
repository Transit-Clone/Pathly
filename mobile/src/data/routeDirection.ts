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

type Projection = { segment: number; t: number; point: LatLon; distance: number };

/** The point on `path` nearest `point`, searching segments `from`..`to` (segment i joins points i and i + 1). */
function projectOnPath(path: readonly LatLon[], point: LatLon, from = 0, to = path.length - 2): Projection {
  // Meters on a flat plane around `point`: exact enough at a route's scale.
  const xScale = METERS_PER_DEGREE * Math.cos(point.lat * (Math.PI / 180));
  const x = (p: LatLon) => (p.lon - point.lon) * xScale;
  const y = (p: LatLon) => (p.lat - point.lat) * METERS_PER_DEGREE;
  let best: Projection = { segment: from, t: 0, point: path[from]!, distance: Infinity };
  for (let segment = from; segment <= to; segment += 1) {
    const a = path[segment]!;
    const b = path[segment + 1]!;
    const dx = x(b) - x(a);
    const dy = y(b) - y(a);
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(x(a) * dx + y(a) * dy) / lengthSquared));
    const distance = Math.hypot(x(a) + t * dx, y(a) + t * dy);
    if (distance < best.distance) {
      best = { segment, t, point: { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }, distance };
    }
  }
  return best;
}

/**
 * `path` cut at the stop `stops[stopIndex]`: the part behind the rider and the part ahead, both
 * ending exactly at the spot on the line nearest the stop. Paths can have points kilometers apart
 * (the 1 train's shape runs 7 km without one), so cutting at the nearest point instead moved the
 * faint/full change far down the line. `path` and `stops` are both in travel order; the search
 * stays between the neighboring stops, so a line that passes the same stop twice (a loop) still
 * cuts at the right pass.
 */
export function splitPathAtStop(path: readonly LatLon[], stops: readonly LatLon[], stopIndex: number): { behind: LatLon[]; ahead: LatLon[] } {
  const stop = stops[stopIndex];
  if (path.length < 2 || !stop) return { behind: [], ahead: [...path] };
  const lastSegment = path.length - 2;
  const previous = stops[stopIndex - 1];
  const next = stops[stopIndex + 1];
  const from = previous ? projectOnPath(path, previous).segment : 0;
  const to = next ? projectOnPath(path, next, from).segment : lastSegment;
  const cut = projectOnPath(path, stop, from, Math.max(from, to));
  // A stop right on a path point cuts there, without repeating the point.
  const before = path.slice(0, cut.segment + 1);
  const after = path.slice(cut.segment + 1);
  if (cut.t === 0) return { behind: before, ahead: [cut.point, ...after] };
  if (cut.t === 1) return { behind: [...before, cut.point], ahead: after };
  return { behind: [...before, cut.point], ahead: [cut.point, ...after] };
}

/** How far either side of the arrow's spot the line must run straight, so the arrow never meets it. */
const ARROW_HALF_SPAN_METERS = 70;
/** Candidate spots are tried this far apart along the line ahead. */
const ARROW_STEP_METERS = 20;

/**
 * Where to draw the direction arrow beside a line: the straightest stretch of `ahead` (the line
 * from the rider's stop onward) between `fromMeters` and `toMeters` along it, preferring spots near
 * the stop. A straight stretch matters: drawn beside a bend, the line curls into the arrow. Null when
 * there's no line ahead to point along.
 */
export function directionArrowAt(ahead: readonly LatLon[], fromMeters = 90, toMeters = 450): { point: LatLon; bearing: number } | null {
  if (ahead.length < 2) return null;
  let total = 0;
  for (let index = 1; index < ahead.length; index += 1) total += distanceMeters(ahead[index - 1]!, ahead[index]!);
  if (total < 1) return null;
  const along = (meters: number): LatLon => {
    let left = Math.max(0, Math.min(meters, total));
    for (let index = 0; index < ahead.length - 1; index += 1) {
      const a = ahead[index]!;
      const b = ahead[index + 1]!;
      const length = distanceMeters(a, b);
      if (length >= left && length > 0) {
        const t = left / length;
        return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
      }
      left -= length;
    }
    return ahead[ahead.length - 1]!;
  };
  // A short line: its middle, pointing along it end to end.
  if (total < fromMeters + ARROW_HALF_SPAN_METERS) {
    const first = ahead[0]!;
    const last = ahead[ahead.length - 1]!;
    return { point: along(total / 2), bearing: bearingDegrees(first, last) };
  }
  let best: { point: LatLon; bearing: number; cost: number } | null = null;
  for (let at = fromMeters; at <= Math.min(toMeters, total - ARROW_HALF_SPAN_METERS); at += ARROW_STEP_METERS) {
    const start = along(at - ARROW_HALF_SPAN_METERS);
    const end = along(at + ARROW_HALF_SPAN_METERS);
    // How far the line strays from the straight chord across the arrow's span (meters).
    let stray = 0;
    for (let offset = -ARROW_HALF_SPAN_METERS; offset <= ARROW_HALF_SPAN_METERS; offset += 10) {
      stray = Math.max(stray, distanceToChordMeters(along(at + offset), start, end));
    }
    // A little stray is worth a spot nearer the stop.
    const cost = stray + (at - fromMeters) * 0.02;
    if (!best || cost < best.cost) best = { point: along(at), bearing: bearingDegrees(start, end), cost };
  }
  if (!best) return null;
  return { point: best.point, bearing: best.bearing };
}

/** A point's distance from the straight line through `a` and `b`, in meters (flat-earth, fine at this scale). */
function distanceToChordMeters(point: LatLon, a: LatLon, b: LatLon): number {
  const cos = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const bx = (b.lon - a.lon) * cos;
  const by = b.lat - a.lat;
  const px = (point.lon - a.lon) * cos;
  const py = point.lat - a.lat;
  const length = Math.hypot(bx, by);
  if (length === 0) return Math.hypot(px, py) * 111_320;
  return (Math.abs(bx * py - by * px) / length) * 111_320;
}

/** `#RRGGBB` with an alpha channel (0–1); other color formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * Where the rider's stop sits in a route's stop list. The nearest-stop lookup names a platform
 * (subway "127N"), while route geometry lists stations ("127"), so an exact id match alone misses
 * every subway stop and the map fell back to the whole line. Tries the exact id, then the station
 * the platform belongs to, then the stop's name. -1 when none match.
 */
export function focusStopIndex(stops: readonly { stopId?: string; name: string }[], stopId: string | undefined, stopName?: string): number {
  if (stopId) {
    const exact = stops.findIndex((stop) => stop.stopId === stopId);
    if (exact >= 0) return exact;
    const station = stopId.replace(/[NS]$/, '');
    const parent = station !== stopId ? stops.findIndex((stop) => stop.stopId === station) : -1;
    if (parent >= 0) return parent;
  }
  return stopName ? stops.findIndex((stop) => stop.name === stopName) : -1;
}
