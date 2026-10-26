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
 * The live vehicle on its way to the rider's stop: of `vehicles` running along `behind` (the line
 * leading up to the stop, ending at it), the one with the least of it left to cover. Null when none
 * is on that stretch (within `maxOffMeters` of it: GPS and the drawn line don't match exactly).
 */
export function approachingVehicle<T extends LatLon>(behind: readonly LatLon[], vehicles: readonly T[], maxOffMeters = 250): T | null {
  if (behind.length < 2) return null;
  // Distance along `behind` to its end (the stop) from the start of each segment.
  const toEnd: number[] = new Array(behind.length).fill(0);
  for (let index = behind.length - 2; index >= 0; index -= 1) toEnd[index] = toEnd[index + 1]! + distanceMeters(behind[index]!, behind[index + 1]!);
  let best: { vehicle: T; left: number } | null = null;
  for (const vehicle of vehicles) {
    const projection = projectOnPath(behind, vehicle);
    if (projection.distance > maxOffMeters) continue;
    const left = toEnd[projection.segment + 1]! + distanceMeters(projection.point, behind[projection.segment + 1]!);
    if (!best || left < best.left) best = { vehicle, left };
  }
  return best?.vehicle ?? null;
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

// The arrow is drawn at a fixed size on screen (DirectionArrow.tsx), so where it can go is worked
// out in screen pixels and converted to meters for the map's current zoom. In meters alone, zooming
// out would let a bend in the line curl into it.
/** How far either side of the arrow's spot (px) the line must run straight: the arrow's length plus room. */
const ARROW_HALF_SPAN_PX = 24;
/** The most the line may stray (px) toward the arrow across that span and still clear it. */
const ARROW_MAX_STRAY_PX = 6;
/** Where to look along the line ahead (px from the rider's stop), and how far apart to try. */
const ARROW_FROM_PX = 30;
const ARROW_TO_PX = 160;
const ARROW_STEP_PX = 6;

/** Meters per screen pixel at a web-map zoom level and latitude. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Where to draw the direction arrow beside a line at the map's current scale: the straightest
 * stretch of `ahead` (the line from the rider's stop onward) a little way past the stop, preferring
 * spots near it. Drawn beside a bend, the line would curl into the arrow, so null when no stretch is
 * straight enough at this zoom (and when there's no line ahead to point along).
 */
export function directionArrowAt(ahead: readonly LatLon[], metersPerPx = 3): { point: LatLon; bearing: number } | null {
  if (ahead.length < 2) return null;
  const halfSpan = ARROW_HALF_SPAN_PX * metersPerPx;
  const fromMeters = ARROW_FROM_PX * metersPerPx;
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
  // A line too short on screen for the arrow beside it: nothing to point along.
  if (total < 2 * halfSpan) return null;
  const first = Math.min(fromMeters, total / 2);
  const last = Math.min(ARROW_TO_PX * metersPerPx, total - halfSpan);
  let best: { point: LatLon; bearing: number; cost: number } | null = null;
  for (let at = Math.max(first, halfSpan); at <= last; at += ARROW_STEP_PX * metersPerPx) {
    const start = along(at - halfSpan);
    const end = along(at + halfSpan);
    // How far the line strays from the straight chord across the arrow's span.
    let stray = 0;
    for (let step = -4; step <= 4; step += 1) {
      stray = Math.max(stray, distanceToChordMeters(along(at + (step / 4) * halfSpan), start, end));
    }
    if (stray > ARROW_MAX_STRAY_PX * metersPerPx) continue;
    // A little stray is worth a spot nearer the stop.
    const cost = stray / metersPerPx + (at - first) / metersPerPx * 0.02;
    if (!best || cost < best.cost) best = { point: along(at), bearing: bearingDegrees(start, end), cost };
  }
  return best ? { point: best.point, bearing: best.bearing } : null;
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
