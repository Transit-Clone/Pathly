import { haversineMeters } from './geo';
import { AGENCY_CONFIGS, agencyConfig, type AgencyId } from './gtfsAgencies';
import { computeRouteGeometry, type RouteGeometry } from './gtfsGeometry';
import {
  availableAgencyIds,
  loadAgencyShapes,
  loadAgencyStaticData,
  loadGlobalStopRouteIndex,
  loadPreparedRouteGeometry,
  loadRouteStopCounts,
  loadRouteStopTimes,
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

export type { RouteGeometry, RouteGeometryStop } from './gtfsGeometry';

/** See computeRouteGeometry. Reads the route's prepared geometry when available. */
export async function getRouteGeometry(agencyId: AgencyId, routeId: string, directionId: 0 | 1): Promise<RouteGeometry | null> {
  const prepared = loadPreparedRouteGeometry(agencyId, routeId);
  if (prepared) return (await prepared)?.[directionId] ?? null;
  const { tripsById, stopsById } = loadAgencyStaticData(agencyId);
  const { byTrip } = await loadRouteStopTimes(agencyId, routeId);
  return computeRouteGeometry(
    { directionalStops: agencyConfig(agencyId).directionalStops, stopsById, tripsById, byTrip, shapes: () => loadAgencyShapes(agencyId) },
    directionId,
  );
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
  nycferry: 2_400, // ferry landings are few and far between, like LIRR stations but on foot.
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
  nycferry: 12_000,
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
  // Agencies without readable data on this instance (an on-demand one not yet published) are skipped.
  const agencyIds = availableAgencyIds();
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
