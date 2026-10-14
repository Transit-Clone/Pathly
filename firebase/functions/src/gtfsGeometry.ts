import { gtfsTimeToSeconds, type GtfsStop, type GtfsStopTime, type GtfsTrip, type ShapePoint } from './gtfsFeed';

/**
 * Route geometry from one route's timetable — pure, so the prepared-data builder
 * (gtfsDerivedBuild.ts) and the request-time fallback (gtfsDiscovery.ts) produce identical output.
 */

export type RouteGeometryStop = { stopId: string; name: string; lat: number; lon: number; offsetMinutes: number };
/** `path` is the published track/street geometry (GTFS shapes) for the chained trips, when the agency has one. */
export type RouteGeometry = { headsign: string; stops: RouteGeometryStop[]; path?: ShapePoint[] };

/** Chain-building only — `timeSeconds` is each stop's real scheduled time, converted to the public `offsetMinutes` (relative to the chain's own first stop) once the full chain is assembled. */
type ChainStop = { stopId: string; name: string; lat: number; lon: number; timeSeconds: number };
type TripShape = { tripId: string; headsign: string; stops: ChainStop[] };

// Douglas-Peucker tolerance for returned paths: visually identical at street zoom while keeping
// payloads to a few hundred points per direction.
const PATH_SIMPLIFY_METERS = 4;

function metresXY(point: ShapePoint): [number, number] {
  return [point.lon * 111_320 * Math.cos((point.lat * Math.PI) / 180), point.lat * 110_540];
}

function nearestPointIndex(points: readonly ShapePoint[], target: { lat: number; lon: number }): number {
  const [tx, ty] = metresXY(target);
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const [x, y] = metresXY(point);
    const distance = (x - tx) ** 2 + (y - ty) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** Iterative Douglas-Peucker (no recursion depth limits on long shapes). */
function simplifyPath(points: readonly ShapePoint[], toleranceMeters: number): ShapePoint[] {
  if (points.length < 3) return [...points];
  const xy = points.map(metresXY);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = xy[start]!;
    const [bx, by] = xy[end]!;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let farthest = -1;
    let farthestDistance = 0;
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = xy[i]!;
      const distance = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / length;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }
    if (farthest >= 0 && farthestDistance > toleranceMeters) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/** A trip's shape_id, or (subway, whose trips.txt often leaves it blank) the shape named by its trip_id suffix. */
function shapeForTrip(input: RouteGeometryInput, tripId: string): ShapePoint[] | undefined {
  const shapes = input.shapes();
  const trip = input.tripsById.get(tripId);
  if (trip?.shapeId && shapes.has(trip.shapeId)) return shapes.get(trip.shapeId);
  const suffix = tripId.slice(tripId.lastIndexOf('_') + 1);
  return shapes.get(suffix);
}

/**
 * The chained trips' real track/street geometry: each trip's shape trimmed to the stretch
 * between its own first and last stop, joined in travel order, then simplified. Undefined when
 * any trip has no published shape, so the client falls back to joining stops.
 */
function pathForTrips(input: RouteGeometryInput, trips: readonly TripShape[]): ShapePoint[] | undefined {
  const joined: ShapePoint[] = [];
  for (const trip of trips) {
    const shape = shapeForTrip(input, trip.tripId);
    const first = trip.stops[0];
    const last = trip.stops[trip.stops.length - 1];
    if (!shape || shape.length < 2 || !first || !last) return undefined;
    const from = nearestPointIndex(shape, first);
    const to = nearestPointIndex(shape, last);
    const piece = from <= to ? shape.slice(from, to + 1) : shape.slice(to, from + 1).reverse();
    joined.push(...(joined.length > 0 ? piece.slice(1) : piece));
  }
  return joined.length >= 2 ? simplifyPath(joined, PATH_SIMPLIFY_METERS) : undefined;
}

/**
 * One route's stop times plus the agency data needed to resolve them. `shapes` is called only
 * when the direction has trips, so request-time callers can keep loading shapes.txt lazily.
 */
export type RouteGeometryInput = {
  directionalStops: boolean;
  stopsById: ReadonlyMap<string, GtfsStop>;
  tripsById: ReadonlyMap<string, GtfsTrip>;
  byTrip: ReadonlyMap<string, readonly GtfsStopTime[]>;
  shapes: () => ReadonlyMap<string, ShapePoint[]>;
};

/**
 * A representative real station sequence — with each stop's real scheduled time offset from
 * the first stop — for one route_id/direction_id. Works for any route on any configured
 * agency, including branches whose trips split partway (LIRR's Port Jefferson Branch splits at
 * Huntington: electric trains run Penn Station<->Huntington, diesel trains run
 * Huntington<->Port Jefferson, so no single trip covers the whole branch). Starts from the
 * longest scheduled trip, then repeatedly chains on any other trip whose first stop matches
 * the current chain's last stop, splicing them together at the shared station — this is
 * exactly how a human would reconstruct the full branch from its real timetable, just
 * automated, so it needs no hand-authored geometry (or timing) for any specific route. This is
 * the one real source of a route's full stop sequence and timing — the client uses it for both
 * the map and the "Route stops" list, rather than keeping a second, hand-authored stop list
 * that can silently drift from (or simply never match) this real one.
 */
export function computeRouteGeometry(input: RouteGeometryInput, directionId: 0 | 1): RouteGeometry | null {
  const { byTrip, stopsById, tripsById } = input;

  const resolveStop = (stopId: string): { stopId: string; name: string; lat: number; lon: number } | null => {
    const stop = stopsById.get(stopId);
    if (!stop) return null;
    const resolved = input.directionalStops && stop.parentStation ? stopsById.get(stop.parentStation) : stop;
    return resolved ? { stopId: resolved.stopId, name: resolved.name, lat: resolved.lat, lon: resolved.lon } : null;
  };

  const candidateTrips: TripShape[] = [];
  for (const [tripId, stopTimes] of byTrip) {
    const trip = tripsById.get(tripId);
    if (!trip || trip.directionId !== directionId) continue;
    const stops = [...stopTimes]
      .sort((a, b) => a.stopSequence - b.stopSequence)
      .map((stopTime): ChainStop | null => {
        const resolved = resolveStop(stopTime.stopId);
        if (!resolved) return null;
        return { ...resolved, timeSeconds: gtfsTimeToSeconds(stopTime.arrivalTime || stopTime.departureTime) };
      })
      .filter((stop): stop is ChainStop => stop !== null);
    if (stops.length > 0) candidateTrips.push({ tripId, headsign: trip.headsign, stops });
  }
  if (candidateTrips.length === 0) return null;

  candidateTrips.sort((a, b) => b.stops.length - a.stops.length);
  const base = candidateTrips[0]!;
  const usedTripIds = new Set([base.tripId]);
  // Trips in travel order, so their shapes can be joined the same way their stops are.
  const orderedTrips: TripShape[] = [base];
  let headsign = base.headsign;
  let stops = base.stops;

  // Chains in both directions: appending a trip whose first stop matches the chain's current
  // last stop (and adopting its headsign, since that becomes the new true final destination —
  // e.g. a Penn<->Huntington trip's "Huntington" headsign is replaced by a chained-on
  // Huntington<->Port Jefferson trip's "Port Jefferson"), or prepending a trip whose last stop
  // matches the chain's current first stop (headsign unchanged — the destination doesn't
  // change just because an earlier leg was found).
  //
  // A chained-on trip is a *different, unrelated* trip_id that just happens to share a stop_id
  // with the current chain (e.g. LIRR's electric Penn<->Huntington and diesel
  // Huntington<->Port Jefferson trips) — it is not necessarily the same physical train
  // continuing, and its own schedule can be anchored at a completely different time of day, so
  // its absolute stop times can't be trusted as-is (splicing them in directly produced
  // nonsensical negative offsets for stops past Huntington). Each spliced-on segment is
  // rebased by a constant so its shared stop lines up exactly with the chain's existing time
  // there — this preserves every real per-hop duration *within* that segment (only a flat
  // shift is applied) while guaranteeing the assembled chain's offsets increase smoothly
  // through the splice, the same way the station list was hand-chained end to end before this
  // was automated, just derived from real data instead of estimated.
  let extended = true;
  while (extended) {
    extended = false;
    const lastStopId = stops[stops.length - 1]?.stopId;
    const firstStopId = stops[0]?.stopId;
    for (const candidate of candidateTrips) {
      if (usedTripIds.has(candidate.tripId)) continue;
      if (candidate.stops[0]?.stopId === lastStopId) {
        const correction = stops[stops.length - 1]!.timeSeconds - candidate.stops[0]!.timeSeconds;
        const rebased = candidate.stops.map((stop) => ({ ...stop, timeSeconds: stop.timeSeconds + correction }));
        stops = [...stops, ...rebased.slice(1)];
        usedTripIds.add(candidate.tripId);
        orderedTrips.push(candidate);
        headsign = candidate.headsign;
        extended = true;
        break;
      }
      if (candidate.stops[candidate.stops.length - 1]?.stopId === firstStopId) {
        const correction = stops[0]!.timeSeconds - candidate.stops[candidate.stops.length - 1]!.timeSeconds;
        const rebased = candidate.stops.map((stop) => ({ ...stop, timeSeconds: stop.timeSeconds + correction }));
        stops = [...rebased.slice(0, -1), ...stops];
        usedTripIds.add(candidate.tripId);
        orderedTrips.unshift(candidate);
        extended = true;
        break;
      }
    }
  }

  const firstTimeSeconds = stops[0]?.timeSeconds ?? 0;
  const path = pathForTrips(input, orderedTrips);
  return {
    headsign,
    stops: stops.map(({ timeSeconds, ...stop }) => ({ ...stop, offsetMinutes: Math.round((timeSeconds - firstTimeSeconds) / 60) })),
    ...(path ? { path } : {}),
  };
}
