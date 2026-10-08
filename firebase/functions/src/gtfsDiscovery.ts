import { haversineMeters } from './geo';
import { AGENCY_CONFIGS, agencyConfig, type AgencyId } from './gtfsAgencies';
import {
  gtfsTimeToSeconds,
  loadAgencyShapes,
  loadAgencyStaticData,
  loadGlobalStopRouteIndex,
  loadRouteStopCounts,
  loadRouteStopTimes,
  type ShapePoint,
} from './gtfsStaticData';

export type NearbyStop = {
  /** The parent station's stop_id for agencies with directional platform stop_ids (one entry per physical station, not per direction); otherwise the stop's own id. */
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  routeIds: string[];
};

/** Nearest stops on one agency's system to a point. */
export async function findNearestStops(agencyId: AgencyId, lat: number, lon: number, limit = 8): Promise<NearbyStop[]> {
  const config = agencyConfig(agencyId);
  const { stopsById } = loadAgencyStaticData(agencyId);
  const stopRouteIndex = await loadGlobalStopRouteIndex(agencyId);

  const routeIdsByStation = new Map<string, Set<string>>();
  for (const stop of stopsById.values()) {
    const routeIds = stopRouteIndex.get(stop.stopId);
    if (!routeIds) continue;
    const stationId = config.directionalStops ? (stop.parentStation ?? stop.stopId) : stop.stopId;
    const set = routeIdsByStation.get(stationId);
    if (set) for (const routeId of routeIds) set.add(routeId);
    else routeIdsByStation.set(stationId, new Set(routeIds));
  }

  const results: NearbyStop[] = [];
  for (const [stationId, routeIds] of routeIdsByStation) {
    const station = stopsById.get(stationId);
    if (!station) continue;
    results.push({
      stopId: stationId,
      stopName: station.name,
      lat: station.lat,
      lon: station.lon,
      distanceMeters: haversineMeters(lat, lon, station.lat, station.lon),
      routeIds: [...routeIds],
    });
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results.slice(0, limit);
}

export type RouteGeometryStop = { stopId: string; name: string; lat: number; lon: number; offsetMinutes: number };
/** `path` is the published track/street geometry (GTFS shapes) for the chained trips, when the agency has one. */
export type RouteGeometry = { headsign: string; stops: RouteGeometryStop[]; path?: ShapePoint[] };

/** Chain-building only — `timeSeconds` is each stop's real scheduled time, converted to the public `offsetMinutes` (relative to the chain's own first stop) once the full chain is assembled. */
type ChainStop = { stopId: string; name: string; lat: number; lon: number; timeSeconds: number };
type TripShape = { tripId: string; headsign: string; stops: ChainStop[] };

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
function shapeForTrip(agencyId: AgencyId, tripId: string): ShapePoint[] | undefined {
  const shapes = loadAgencyShapes(agencyId);
  const trip = loadAgencyStaticData(agencyId).tripsById.get(tripId);
  if (trip?.shapeId && shapes.has(trip.shapeId)) return shapes.get(trip.shapeId);
  const suffix = tripId.slice(tripId.lastIndexOf('_') + 1);
  return shapes.get(suffix);
}

/**
 * The chained trips' real track/street geometry: each trip's shape trimmed to the stretch
 * between its own first and last stop, joined in travel order, then simplified. Undefined when
 * any trip has no published shape, so the client falls back to joining stops.
 */
function pathForTrips(agencyId: AgencyId, trips: readonly TripShape[]): ShapePoint[] | undefined {
  const joined: ShapePoint[] = [];
  for (const trip of trips) {
    const shape = shapeForTrip(agencyId, trip.tripId);
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

export async function getRouteGeometry(agencyId: AgencyId, routeId: string, directionId: 0 | 1): Promise<RouteGeometry | null> {
  const config = agencyConfig(agencyId);
  const { tripsById, stopsById } = loadAgencyStaticData(agencyId);
  const { byTrip } = await loadRouteStopTimes(agencyId, routeId);

  const resolveStop = (stopId: string): { stopId: string; name: string; lat: number; lon: number } | null => {
    const stop = stopsById.get(stopId);
    if (!stop) return null;
    const resolved = config.directionalStops && stop.parentStation ? stopsById.get(stop.parentStation) : stop;
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
  const path = pathForTrips(agencyId, orderedTrips);
  return {
    headsign,
    stops: stops.map(({ timeSeconds, ...stop }) => ({ ...stop, offsetMinutes: Math.round((timeSeconds - firstTimeSeconds) / 60) })),
    ...(path ? { path } : {}),
  };
}

export type NearestRouteStop = {
  /** Smallest of direction1/direction0's distanceMeters — "how far is the nearest thing on this route", for display. */
  distanceMeters: number;
  direction1: { stopId: string; name: string; headsign: string | null } | null;
  direction0: { stopId: string; name: string; headsign: string | null } | null;
};

/**
 * The nearest stop *on one specific route* to a point, resolved independently for each
 * direction — e.g. "which Port Jefferson Branch station is actually closest to the rider right
 * now", not just the nearest station anywhere on the LIRR system, and not assuming the two
 * directions share a station at all.
 *
 * Earlier versions of this found one nearest "station" (grouping directional platform
 * stop_ids under their parent_station, same as findNearestStops) and then asked which stop_id
 * served each direction *at that station*. That only works for agencies with a parent_station
 * link (NYC Subway) or where one stop_id truly serves both directions (LIRR) — NICE Bus and
 * Suffolk County Transit have neither: every stop serves exactly one direction, with no
 * parent_station tying it to its opposite-direction counterpart (confirmed: 0 of several
 * thousand stops across both agencies have one set), so that approach always came back empty
 * for them. Searching independently per direction needs no such link for any agency — it's
 * just "the nearest stop among the ones this route's direction_id-1 trips actually visit," and
 * the same again for direction_id 0 — so one path now covers every agency uniformly.
 *
 * Only counts a stop if this route calls there with real regularity (at least 10% as many
 * scheduled trips, within its own direction, as that direction's busiest stop) — not just
 * anywhere a rare rerouted/overnight trip happens to touch. Without this, a nearest-but-barely
 * -served stop can get picked (e.g. the E train's static schedule includes a handful of trips
 * diverted to Jamaica-179 St, which otherwise looks like a perfectly normal stop), leaving live
 * predictions permanently empty there since real trips almost never actually call.
 */
export async function getNearestStopForRoute(agencyId: AgencyId, routeId: string, lat: number, lon: number): Promise<NearestRouteStop | null> {
  const { stopsById, tripsById } = loadAgencyStaticData(agencyId);
  const tripCountByDirectionAndStop = await loadRouteStopCounts(agencyId, routeId);

  const MIN_SERVICE_FRACTION = 0.1;
  const nearestInDirection = (directionId: 0 | 1): { stopId: string; name: string; headsign: string | null; distanceMeters: number } | null => {
    const tripCounts = tripCountByDirectionAndStop[directionId];
    const maxTripCount = Math.max(0, ...tripCounts.values());
    let nearest: { stopId: string; name: string; distanceMeters: number } | null = null;
    for (const [stopId, tripCount] of tripCounts) {
      if (tripCount < maxTripCount * MIN_SERVICE_FRACTION) continue;
      const stop = stopsById.get(stopId);
      if (!stop) continue;
      const distanceMeters = haversineMeters(lat, lon, stop.lat, stop.lon);
      if (!nearest || distanceMeters < nearest.distanceMeters) {
        nearest = { stopId, name: stop.name, distanceMeters };
      }
    }
    if (!nearest) return null;
    let headsign: string | null = null;
    for (const trip of tripsById.values()) {
      if (trip.routeId === routeId && trip.directionId === directionId) {
        headsign = trip.headsign;
        break;
      }
    }
    return { ...nearest, headsign };
  };

  const direction1 = nearestInDirection(1);
  const direction0 = nearestInDirection(0);
  if (!direction1 && !direction0) return null;

  return {
    distanceMeters: Math.min(direction1?.distanceMeters ?? Infinity, direction0?.distanceMeters ?? Infinity),
    direction1,
    direction0,
  };
}

export type DiscoveredRoute = {
  agencyId: AgencyId;
  agencyDisplayName: string;
  routeId: string;
  routeName: string;
  shortName: string;
  /** Hex, with a leading "#" (GTFS stores it bare). */
  color: string;
  /** Smallest of direction1/direction0's own distance — see getNearestStopForRoute. */
  distanceMeters: number;
  direction1: { stopId: string; name: string; headsign: string | null } | null;
  direction0: { stopId: string; name: string; headsign: string | null } | null;
};

// "Nearest" isn't the same as "nearby" — findNearestStops always returns the N closest stops
// in that agency's whole system, even if that's 50 miles away somewhere with no real transit
// nearby. These cut off anything past a distance no one would reasonably call "nearby", and
// differ by agency since riders realistically travel farther to a sparse LIRR station than to
// a dense subway stop; a new agency without an entry here gets the subway-style default.
const MAX_NEARBY_DISTANCE_METERS: Partial<Record<AgencyId, number>> = {
  subway: 1_600, // ~1 mile — subway stations are dense; anything farther isn't walkably "nearby".
  lirr: 8_000, // ~5 miles — LIRR branches are sparse; riders commonly drive to a station.
  nice: 2_400, // ~1.5 miles — suburban bus stops are sparser than subway but denser than LIRR.
  suffolk: 2_400,
};
const DEFAULT_MAX_NEARBY_DISTANCE_METERS = 1_600;

// Every route within each agency's base radius above (small for dense subway, larger for sparse
// bus/LIRR) is listed. Only when that's fewer than MIN_NEARBY_ROUTES does the search widen —
// times 2, 4, then 8, capped per agency — and then it adds just the closest extra routes needed,
// never everything in the wider circle. MAX_NEARBY_ROUTES only guards against pathological
// cases; a dense neighborhood's walkable routes are all shown.
const NEARBY_PASS_MULTIPLIERS = [1, 2, 4, 8];
const MIN_NEARBY_ROUTES = 6;
const MAX_NEARBY_ROUTES = 40;
const MAX_NEARBY_CAP_METERS: Partial<Record<AgencyId, number>> = {
  subway: 6_000,
  lirr: 30_000,
  nice: 12_000,
  suffolk: 12_000,
};
const DEFAULT_MAX_NEARBY_CAP_METERS = 6_000;

// Only a candidate-discovery step before the real distance filter: generous enough that the
// widest pass, not this count, decides what's "nearby" (a dense bus hub easily serves 10+
// routes, and the widest pass covers several hubs).
const CANDIDATE_STOPS_PER_AGENCY = 400;

/**
 * Which routes Nearby lists: every route within the base radius (`base`), and — only when that's
 * fewer than `min` — the closest of the routes found farther out (`wider`), just enough to reach
 * `min`. Ordered by distance, at most `max`.
 */
export function pickNearbyRoutes(
  base: readonly DiscoveredRoute[],
  wider: readonly DiscoveredRoute[],
  min = MIN_NEARBY_ROUTES,
  max = MAX_NEARBY_ROUTES,
): DiscoveredRoute[] {
  const byDistance = (a: DiscoveredRoute, b: DiscoveredRoute) => a.distanceMeters - b.distanceMeters;
  const key = (route: DiscoveredRoute) => `${route.agencyId}:${route.routeId}`;
  const baseKeys = new Set(base.map(key));
  const extras = wider.filter((route) => !baseKeys.has(key(route))).sort(byDistance).slice(0, Math.max(0, min - base.length));
  return [...base, ...extras].sort(byDistance).slice(0, max);
}

/**
 * Real routes, on every configured agency, near a point (see pickNearbyRoutes for which). Starts
 * from each agency's base "nearby" radius; when fewer than MIN_NEARBY_ROUTES routes are that
 * close, widens in passes (NEARBY_PASS_MULTIPLIERS, capped per agency) only until enough are
 * found. Each route is resolved (its own nearest stop per direction) at most once across passes.
 * One entry per (agency, route_id), ordered by distance. Adding an agency to gtfsAgencies.ts makes
 * it show up here automatically.
 */
export async function findNearbyTransit(lat: number, lon: number, limit = MAX_NEARBY_ROUTES): Promise<DiscoveredRoute[]> {
  const agencyIds = Object.keys(AGENCY_CONFIGS) as AgencyId[];
  const baseRadius = (agencyId: AgencyId) => MAX_NEARBY_DISTANCE_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_DISTANCE_METERS;
  const capRadius = (agencyId: AgencyId) => MAX_NEARBY_CAP_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_CAP_METERS;
  const candidateStops = new Map(
    await Promise.all(agencyIds.map(async (agencyId) => [agencyId, await findNearestStops(agencyId, lat, lon, CANDIDATE_STOPS_PER_AGENCY)] as const)),
  );
  // `${agencyId}:${routeId}` -> resolved route (null if it has no usable stop), across passes.
  const resolved = new Map<string, DiscoveredRoute | null>();

  const resolveRoute = async (agencyId: AgencyId, routeId: string): Promise<DiscoveredRoute | null> => {
    const route = loadAgencyStaticData(agencyId).routesById.get(routeId);
    if (!route) return null;
    const nearest = await getNearestStopForRoute(agencyId, routeId, lat, lon);
    if (!nearest) return null;
    return {
      agencyId,
      agencyDisplayName: agencyConfig(agencyId).displayName,
      routeId,
      routeName: route.name,
      shortName: route.shortName,
      color: `#${route.color}`,
      distanceMeters: nearest.distanceMeters,
      direction1: nearest.direction1,
      direction0: nearest.direction0,
    };
  };

  const resolvedWithin = (multiplier: number) => [...resolved.values()].filter((route): route is DiscoveredRoute => (
    route !== null && route.distanceMeters <= Math.min(baseRadius(route.agencyId) * multiplier, capRadius(route.agencyId))
  ));

  let base: DiscoveredRoute[] = [];
  let wider: DiscoveredRoute[] = [];
  for (const multiplier of NEARBY_PASS_MULTIPLIERS) {
    const radius = (agencyId: AgencyId) => Math.min(baseRadius(agencyId) * multiplier, capRadius(agencyId));
    // Resolving candidates concurrently means a pass takes as long as its slowest route, not the sum.
    await Promise.all(
      agencyIds.flatMap((agencyId) => {
        const routeIds = new Set<string>();
        for (const stop of candidateStops.get(agencyId) ?? []) {
          if (stop.distanceMeters <= radius(agencyId)) for (const routeId of stop.routeIds) routeIds.add(routeId);
        }
        return [...routeIds]
          .filter((routeId) => !resolved.has(`${agencyId}:${routeId}`))
          .map(async (routeId) => {
            resolved.set(`${agencyId}:${routeId}`, null);
            resolved.set(`${agencyId}:${routeId}`, await resolveRoute(agencyId, routeId));
          });
      }),
    );
    if (multiplier === 1) base = resolvedWithin(1);
    wider = resolvedWithin(multiplier);
    if (wider.length >= MIN_NEARBY_ROUTES) break;
  }

  return pickNearbyRoutes(base, wider, MIN_NEARBY_ROUTES, Math.min(limit, MAX_NEARBY_ROUTES));
}
