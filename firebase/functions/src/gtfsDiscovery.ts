import { haversineMeters } from './geo';
import { AGENCY_CONFIGS, agencyConfig, type AgencyId } from './gtfsAgencies';
import { computeRouteGeometry, simplifyPath, type RouteGeometry } from './gtfsGeometry';
import {
  availableAgencyIds,
  isAgencyAvailable,
  loadAgencyShapes,
  loadAgencyStaticData,
  loadGlobalStopRouteIndex,
  loadPreparedRouteGeometry,
  loadRouteStopCounts,
  loadRouteStopTimes,
} from './gtfsStaticData';
import { displayRouteColor } from './routeColors';
import { walkingMeters, walkingPath } from './walkingGraph';

export type NearbyStop = {
  /** The parent station's stop_id for agencies with directional platform stop_ids (one entry per physical station, not per direction); otherwise the stop's own id. */
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  routeIds: string[];
};

/** A place Nearby can find routes from: a stop (a station, for directional platforms) and the routes calling there. */
export type NearbyStation = Omit<NearbyStop, 'distanceMeters'>;

/** Every station on one agency's system with the routes calling there, in feed order. */
export async function agencyStations(agencyId: AgencyId): Promise<NearbyStation[]> {
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

  const stations: NearbyStation[] = [];
  for (const [stationId, routeIds] of routeIdsByStation) {
    const station = stopsById.get(stationId);
    if (!station) continue;
    stations.push({ stopId: stationId, stopName: station.name, lat: station.lat, lon: station.lon, routeIds: [...routeIds] });
  }
  return stations;
}

/** The `limit` stations nearest a point, closest first (ties keep feed order). */
export function nearestStations(stations: readonly NearbyStation[], lat: number, lon: number, limit: number): NearbyStop[] {
  const results = stations.map((station) => ({ ...station, distanceMeters: haversineMeters(lat, lon, station.lat, station.lon) }));
  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results.slice(0, limit);
}

/** Nearest stops on one agency's system to a point. */
export async function findNearestStops(agencyId: AgencyId, lat: number, lon: number, limit = 8): Promise<NearbyStop[]> {
  return nearestStations(await agencyStations(agencyId), lat, lon, limit);
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

/**
 * One direction's stop. `distanceMeters` is straight line from the rider; `walkMeters` is the walk
 * there along the street graph, or null when it fell back to straight line. `stopsAhead` is how
 * many stops this direction still has after this one (0 at the end of the line), null when the
 * route's stop sequence couldn't be read.
 */
export type RouteDirectionStop = { stopId: string; name: string; headsign: string | null; distanceMeters: number; walkMeters: number | null; stopsAhead: number | null; lat: number; lon: number };

export type NearestRouteStop = {
  /** Smallest straight-line distance to direction1's/direction0's stop — "how far is the nearest thing on this route", for display and the Nearby radius. */
  distanceMeters: number;
  direction1: RouteDirectionStop | null;
  direction0: RouteDirectionStop | null;
};

// Within this straight-line distance the stop is chosen by walking distance; farther out (an LIRR
// station riders drive to) straight line is what matters, and searching that far would be slow.
const WALK_RANGE_METERS = 2_500;
// A walk longer than this isn't searched; such a stop counts as unreachable on foot.
const WALK_LIMIT_METERS = 5_000;
// The walk drawn to the rider's stop: up to about an hour on foot (4.8 km at 80 m a minute, the
// app's walking pace), so only stops within this straight line of the rider are tried.
const WALK_PATH_LIMIT_METERS = 4_800;
const WALK_PATH_RANGE_METERS = 4_000;
// The straight-line nearest few are enough: walking is never shorter than straight line, so the
// search stops at the first stop farther in straight line than the best walk so far.
const MAX_WALK_CANDIDATES = 6;

type CandidateStop = { stopId: string; name: string; lat: number; lon: number; distanceMeters: number };

/**
 * The candidate nearest on foot from (lat, lon), or the straight-line nearest when walking data
 * is missing, the stops are out of walking range, or none can be reached on foot. `candidates`
 * must be sorted by straight-line distance.
 */
export function pickWalkingNearest<T extends CandidateStop>(
  candidates: readonly T[],
  lat: number,
  lon: number,
  walk: (toLat: number, toLon: number) => number | null = (toLat, toLon) => walkingMeters(lat, lon, toLat, toLon, WALK_LIMIT_METERS),
): { stop: T; walkMeters: number | null } | null {
  const nearest = candidates[0];
  if (!nearest) return null;
  if (nearest.distanceMeters > WALK_RANGE_METERS) return { stop: nearest, walkMeters: null };
  let best: { stop: T; walkMeters: number } | null = null;
  for (const stop of candidates.slice(0, MAX_WALK_CANDIDATES)) {
    if (best && stop.distanceMeters >= best.walkMeters) break;
    const meters = walk(stop.lat, stop.lon);
    if (meters !== null && (!best || meters < best.walkMeters)) best = { stop, walkMeters: meters };
  }
  return best ?? { stop: nearest, walkMeters: null };
}

/** Per direction, the stops some trip of the route leaves from (every stop but a trip's last). */
async function departureStopsByDirection(agencyId: AgencyId, routeId: string): Promise<Record<0 | 1, Set<string>>> {
  const { tripsById } = loadAgencyStaticData(agencyId);
  const { byTrip } = await loadRouteStopTimes(agencyId, routeId);
  const stops: Record<0 | 1, Set<string>> = { 0: new Set(), 1: new Set() };
  for (const [tripId, stopTimes] of byTrip) {
    const directionId = tripsById.get(tripId)?.directionId;
    if (directionId !== 0 && directionId !== 1) continue;
    const ordered = [...stopTimes].sort((a, b) => a.stopSequence - b.stopSequence);
    for (const stopTime of ordered.slice(0, -1)) stops[directionId].add(stopTime.stopId);
  }
  return stops;
}

/**
 * The walk from a point to one stop, for drawing — the same walk pickWalkingNearest measured when
 * it chose that stop. Null when the stop is unknown, more than about an hour's walk away
 * (WALK_PATH_RANGE_METERS), or not reachable on foot.
 */
/**
 * The walk from a point to a stop the app already knows the position of (from a nearby search or
 * live status), so no timetable is read. Null when it's more than about an hour's walk away or not
 * reachable on foot.
 */
export function getWalkingPathBetween(lat: number, lon: number, stopLat: number, stopLon: number): { meters: number; path: { lat: number; lon: number }[] } | null {
  if (haversineMeters(lat, lon, stopLat, stopLon) > WALK_PATH_RANGE_METERS) return null;
  return walkingPath(lat, lon, stopLat, stopLon, WALK_PATH_LIMIT_METERS);
}

export function getWalkingPathToStop(
  agencyId: AgencyId,
  stopId: string,
  lat: number,
  lon: number,
): { meters: number; path: { lat: number; lon: number }[] } | null {
  const stop = loadAgencyStaticData(agencyId).stopsById.get(stopId);
  if (!stop || haversineMeters(lat, lon, stop.lat, stop.lon) > WALK_PATH_RANGE_METERS) return null;
  return walkingPath(lat, lon, stop.lat, stop.lon, WALK_PATH_LIMIT_METERS);
}

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
  return nearestOnRoute(await routeDirectionStops(agencyId, routeId), lat, lon);
}

/** A stop one direction of a route calls at regularly, and how many stops that direction has after it (null if unknown). */
export type ServedStop = { stopId: string; name: string; lat: number; lon: number; stopsAhead: number | null };
/** One direction of a route as Nearby reads it: its headsign and the stops it calls at regularly. */
export type ServedDirection = { headsign: string | null; stops: ServedStop[] };
/** Both directions, by GTFS direction_id. */
export type RouteDirectionStops = { 0: ServedDirection; 1: ServedDirection };

/** Each route's first trip in each direction (feed order), whose headsign the route shows. */
const firstTripHeadsigns = new WeakMap<object, Map<string, string | null>>();

function headsignFor(agencyId: AgencyId, routeId: string, directionId: 0 | 1): string | null {
  const { tripsById } = loadAgencyStaticData(agencyId);
  let headsigns = firstTripHeadsigns.get(tripsById);
  if (!headsigns) {
    headsigns = new Map();
    for (const trip of tripsById.values()) {
      const key = `${trip.routeId}\u0000${trip.directionId}`;
      if (!headsigns.has(key)) headsigns.set(key, trip.headsign);
    }
    firstTripHeadsigns.set(tripsById, headsigns);
  }
  return headsigns.get(`${routeId}\u0000${directionId}`) ?? null;
}

/**
 * The stops each direction of a route calls at with real regularity (see getNearestStopForRoute),
 * in feed order, each with where it sits along the line. Everything a nearest-stop lookup needs,
 * so it can also be saved ahead of time (gtfsNearbyIndex.ts).
 */
export async function routeDirectionStops(agencyId: AgencyId, routeId: string): Promise<RouteDirectionStops> {
  const { stopsById } = loadAgencyStaticData(agencyId);
  const tripCountByDirectionAndStop = await loadRouteStopCounts(agencyId, routeId);
  const departureStops = agencyConfig(agencyId).terminalShuttle ? await departureStopsByDirection(agencyId, routeId) : null;

  const MIN_SERVICE_FRACTION = 0.1;
  const direction = async (directionId: 0 | 1): Promise<ServedDirection> => {
    const tripCounts = tripCountByDirectionAndStop[directionId];
    const maxTripCount = Math.max(0, ...tripCounts.values());
    const stops: ServedStop[] = [];
    for (const [stopId, tripCount] of tripCounts) {
      if (tripCount < maxTripCount * MIN_SERVICE_FRACTION) continue;
      if (departureStops && !departureStops[directionId].has(stopId)) continue;
      const stop = stopsById.get(stopId);
      if (!stop) continue;
      stops.push({ stopId, name: stop.name, lat: stop.lat, lon: stop.lon, stopsAhead: null });
    }
    if (stops.length === 0) return { headsign: null, stops };
    // Where each stop sits along its direction, so riders at the end of a line can be shown the
    // direction they can actually ride. Directional platforms (subway "127N") are listed by station.
    try {
      const geometry = await getRouteGeometry(agencyId, routeId, directionId);
      if (geometry) {
        for (const stop of stops) {
          const station = stopsById.get(stop.stopId)?.parentStation ?? null;
          const index = geometry.stops.findIndex((candidate) => candidate.stopId === stop.stopId || candidate.stopId === station);
          if (index >= 0) stop.stopsAhead = geometry.stops.length - 1 - index;
        }
      }
    } catch {
      // Positions unknown: every stopsAhead stays null.
    }
    return { headsign: headsignFor(agencyId, routeId, directionId), stops };
  };
  const [direction0, direction1] = await Promise.all([direction(0), direction(1)]);
  return { 0: direction0, 1: direction1 };
}

/** Each direction's stop nearest (lat, lon), on foot where walkable (pickWalkingNearest). Null when neither direction has one. */
export function nearestOnRoute(directions: RouteDirectionStops, lat: number, lon: number): NearestRouteStop | null {
  const nearestInDirection = (directionId: 0 | 1): RouteDirectionStop | null => {
    const { headsign, stops } = directions[directionId];
    const candidates = stops.map((stop) => ({ ...stop, distanceMeters: haversineMeters(lat, lon, stop.lat, stop.lon) }));
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const picked = pickWalkingNearest(candidates, lat, lon);
    if (!picked) return null;
    return {
      stopId: picked.stop.stopId,
      name: picked.stop.name,
      distanceMeters: Math.round(picked.stop.distanceMeters),
      walkMeters: picked.walkMeters,
      headsign,
      stopsAhead: picked.stop.stopsAhead,
      lat: picked.stop.lat,
      lon: picked.stop.lon,
    };
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
  direction1: RouteDirectionStop | null;
  direction0: RouteDirectionStop | null;
};

/** One route as Nearby lists it, with each direction's stop nearest (lat, lon). Null for an unknown route or one with no usable stop. */
export async function describeRoute(agencyId: AgencyId, routeId: string, lat: number, lon: number): Promise<DiscoveredRoute | null> {
  const route = await liveRouteInfo(agencyId, routeId);
  return route ? describeRouteAt(agencyId, route, lat, lon) : null;
}

/** What Nearby shows of a route besides its stops: names and color. */
export type NearbyRouteInfo = { routeId: string; name: string; shortName: string; color: string; directions: RouteDirectionStops };

/** A route's names, color and served stops, from this instance's loaded timetable. Null for an unknown route. */
export async function liveRouteInfo(agencyId: AgencyId, routeId: string): Promise<NearbyRouteInfo | null> {
  const route = loadAgencyStaticData(agencyId).routesById.get(routeId);
  if (!route) return null;
  return { routeId, name: route.name, shortName: route.shortName, color: displayRouteColor(agencyId, route), directions: await routeDirectionStops(agencyId, routeId) };
}

/** A route as Nearby lists it at (lat, lon). Null when it has no usable stop. */
export function describeRouteAt(agencyId: AgencyId, route: NearbyRouteInfo, lat: number, lon: number): DiscoveredRoute | null {
  const nearest = nearestOnRoute(route.directions, lat, lon);
  if (!nearest) return null;
  return {
    agencyId,
    agencyDisplayName: agencyConfig(agencyId).displayName,
    routeId: route.routeId,
    routeName: route.name,
    shortName: route.shortName,
    color: route.color,
    distanceMeters: nearest.distanceMeters,
    direction1: nearest.direction1,
    direction0: nearest.direction0,
  };
}

const MAX_ROUTE_RESULTS = 12;
// Words a rider might search a line by besides its own names: its mode ("ferry", "bus", "train").
const MODE_WORDS: Record<AgencyId, string> = { subway: 'subway train', lirr: 'rail train', nycferry: 'ferry boat', siferry: 'ferry boat', nice: 'bus', suffolk: 'bus', bx: 'bus', bk: 'bus', mn: 'bus', qn: 'bus', si: 'bus', busco: 'bus' };
// Rail, subway and ferry lines come before buses: they're what people search for by name.
const MODE_RANK: Record<AgencyId, number> = { subway: 0, lirr: 0, nycferry: 1, siferry: 1, nice: 2, suffolk: 2, bx: 2, bk: 2, mn: 2, qn: 2, si: 2, busco: 2 };
const routeSearchText = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Lines whose name matches a search ("1", "b46", "port jefferson"), best first: an exact short
 * name, then (from two characters typed) a short name starting with the query, then lines where
 * each typed word starts a word of the long name, agency or mode ("astoria", "ferry", "staten
 * island ferry"). Each is described as Nearby would, at its stops nearest (lat, lon).
 */
export async function searchRoutes(query: string, lat: number, lon: number): Promise<DiscoveredRoute[]> {
  const typed = routeSearchText(query);
  if (!typed) return [];
  const words = typed.split(' ');
  const matches: { agencyId: AgencyId; routeId: string; score: number; shortName: string }[] = [];
  for (const agencyId of availableAgencyIds()) {
    const agencyWords = routeSearchText(`${agencyConfig(agencyId).displayName} ${MODE_WORDS[agencyId]}`).split(' ');
    for (const route of loadAgencyStaticData(agencyId).routesById.values()) {
      const short = routeSearchText(route.shortName);
      const longWords = [...routeSearchText(route.name).split(' '), ...agencyWords];
      const score = short === typed ? 3
        : typed.length >= 2 && short.startsWith(typed) && short.length - typed.length <= 2 ? 2
        : typed.length >= 3 && words.every((word) => longWords.some((part) => part.startsWith(word))) ? 1
        : 0;
      if (score > 0) matches.push({ agencyId, routeId: route.routeId, score, shortName: route.shortName });
    }
  }
  // MTA's borough bus feeds overlap (the Bronx and Staten Island feeds both carry Brooklyn's
  // routes), so one line can match once per feed: keep its first.
  const seen = new Set<string>();
  const unique = matches.filter((match) => {
    const key = `${agencyConfig(match.agencyId).displayName}:${match.routeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => b.score - a.score
    || MODE_RANK[a.agencyId] - MODE_RANK[b.agencyId]
    || a.shortName.length - b.shortName.length
    || a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));
  const described = await Promise.all(unique.slice(0, MAX_ROUTE_RESULTS).map((match) => describeRoute(match.agencyId, match.routeId, lat, lon)));
  return described.filter((route): route is DiscoveredRoute => route !== null);
}

/** One line in the app's on-device line index: enough to find it by name and show its badge. */
export type IndexedLine = { agencyId: AgencyId; agencyDisplayName: string; routeId: string; shortName: string; routeName: string; color: string };

/**
 * Version of what listLines returns. The daily refresh saves its output (readLineIndex): bump this
 * when a change alters it (a new field, a color rule) so a deploy doesn't serve the old saved list.
 */
export const LINE_INDEX_FORMAT = 1;

/** Every line of every available agency, for the app to search on the device as the rider types. */
export function listLines(): IndexedLine[] {
  const lines = availableAgencyIds().flatMap((agencyId) => [...loadAgencyStaticData(agencyId).routesById.values()].map((route) => ({
    agencyId,
    agencyDisplayName: agencyConfig(agencyId).displayName,
    routeId: route.routeId,
    shortName: route.shortName,
    routeName: route.name,
    color: displayRouteColor(agencyId, route),
  })));
  // The borough bus feeds overlap (see searchRoutes): each line once.
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.agencyDisplayName}:${line.routeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One of an agency's lines for the home map's line layers: its look and a simplified path. */
export type AgencyLine = { routeId: string; shortName: string; color: string; path: [number, number][] };

// Coarser than route view's paths: the layers are seen zoomed out, and "all buses" is hundreds of lines.
const LINE_LAYER_SIMPLIFY_METERS = 25;
const LINE_LAYER_CONCURRENCY = 16;
const agencyLinesCache = new Map<AgencyId, Promise<AgencyLine[]>>();

/**
 * Every line of an agency, each as one path (direction 0's, else direction 1's) simplified for a
 * zoomed-out map, coordinates rounded to about a meter. Cached per instance: static data changes
 * only on a deploy or a feed refresh.
 */
export function getAgencyLines(agencyId: AgencyId): Promise<AgencyLine[]> {
  const cached = agencyLinesCache.get(agencyId);
  if (cached) return cached;
  const promise = (async () => {
    const routes = [...loadAgencyStaticData(agencyId).routesById.values()];
    const lines: AgencyLine[] = [];
    for (let start = 0; start < routes.length; start += LINE_LAYER_CONCURRENCY) {
      const batch = await Promise.all(routes.slice(start, start + LINE_LAYER_CONCURRENCY).map(async (route): Promise<AgencyLine | null> => {
        const geometry = (await getRouteGeometry(agencyId, route.routeId, 0).catch(() => null))
          ?? (await getRouteGeometry(agencyId, route.routeId, 1).catch(() => null));
        const points = geometry?.path ?? geometry?.stops.map((stop) => ({ lat: stop.lat, lon: stop.lon })) ?? [];
        if (points.length < 2) return null;
        const path = simplifyPath(points, LINE_LAYER_SIMPLIFY_METERS).map((point): [number, number] => [Math.round(point.lat * 1e5) / 1e5, Math.round(point.lon * 1e5) / 1e5]);
        return { routeId: route.routeId, shortName: route.shortName, color: displayRouteColor(agencyId, route), path };
      }));
      lines.push(...batch.filter((line): line is AgencyLine => line !== null));
    }
    return lines;
  })();
  agencyLinesCache.set(agencyId, promise);
  void promise.catch(() => agencyLinesCache.delete(agencyId));
  return promise;
}

/** Another line calling at (or a short walk from) a stop: a transfer badge in route view. */
export type StopTransfer = { agencyId: AgencyId; agencyDisplayName: string; routeId: string; shortName: string; color: string };

// Station transfers (subway to LIRR at Jamaica) span a bigger complex than a bus stop pair does.
const STATION_AGENCIES = new Set<AgencyId>(['subway', 'lirr', 'nycferry', 'siferry']);
const STATION_TRANSFER_METERS = 250;
const STOP_TRANSFER_METERS = 120;
const GRID_DEGREES = 0.005;

type GridStop = { lat: number; lon: number; routeIds: Set<string> };
const gridCache = new Map<AgencyId, Promise<Map<string, GridStop[]>>>();
const transferCache = new Map<string, Promise<Record<string, StopTransfer[]>>>();
const gridKey = (row: number, col: number) => `${row}:${col}`;

/** An agency's served stops on a coarse lat/lon grid, so "what's within 250 m" reads a few cells. */
function stopGrid(agencyId: AgencyId): Promise<Map<string, GridStop[]>> {
  const cached = gridCache.get(agencyId);
  if (cached) return cached;
  const promise = loadGlobalStopRouteIndex(agencyId).then((routeIdsByStop) => {
    const { stopsById } = loadAgencyStaticData(agencyId);
    const grid = new Map<string, GridStop[]>();
    for (const [stopId, routeIds] of routeIdsByStop) {
      const stop = stopsById.get(stopId);
      if (!stop) continue;
      const key = gridKey(Math.floor(stop.lat / GRID_DEGREES), Math.floor(stop.lon / GRID_DEGREES));
      const cell = grid.get(key) ?? [];
      cell.push({ lat: stop.lat, lon: stop.lon, routeIds });
      grid.set(key, cell);
    }
    return grid;
  });
  gridCache.set(agencyId, promise);
  return promise;
}

async function routesNear(agencyId: AgencyId, lat: number, lon: number, radius: number): Promise<Set<string>> {
  const grid = await stopGrid(agencyId);
  const row = Math.floor(lat / GRID_DEGREES);
  const col = Math.floor(lon / GRID_DEGREES);
  const routeIds = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      for (const stop of grid.get(gridKey(row + dr, col + dc)) ?? []) {
        if (haversineMeters(lat, lon, stop.lat, stop.lon) <= radius) stop.routeIds.forEach((id) => routeIds.add(id));
      }
    }
  }
  return routeIds;
}

/**
 * For each stop of a route's direction, the other lines a rider can change to there: the agency's
 * other routes at that station and any agency's lines a short walk away. Rail, subway and ferry
 * first, then buses, each in name order. Cached per route and direction for the instance.
 */
export function getRouteTransfers(agencyId: AgencyId, routeId: string, directionId: 0 | 1): Promise<Record<string, StopTransfer[]>> {
  const cacheKey = `${agencyId}:${routeId}:${directionId}`;
  const cached = transferCache.get(cacheKey);
  if (cached) return cached;
  const promise = (async () => {
    const result: Record<string, StopTransfer[]> = {};
    const geometry = await getRouteGeometry(agencyId, routeId, directionId);
    if (!geometry) return result;
    const agencies = availableAgencyIds();
    for (const stop of geometry.stops) {
      const transfers: StopTransfer[] = [];
      for (const other of agencies) {
        const radius = STATION_AGENCIES.has(agencyId) || STATION_AGENCIES.has(other) ? STATION_TRANSFER_METERS : STOP_TRANSFER_METERS;
        const { routesById } = loadAgencyStaticData(other);
        for (const id of await routesNear(other, stop.lat, stop.lon, radius)) {
          if (other === agencyId && id === routeId) continue;
          const route = routesById.get(id);
          if (!route) continue;
          transfers.push({ agencyId: other, agencyDisplayName: agencyConfig(other).displayName, routeId: id, shortName: route.shortName, color: displayRouteColor(other, route) });
        }
      }
      transfers.sort((a, b) => MODE_RANK[a.agencyId] - MODE_RANK[b.agencyId] || a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));
      if (transfers.length > 0) result[stop.stopId] = transfers;
    }
    return result;
  })();
  transferCache.set(cacheKey, promise);
  promise.catch(() => transferCache.delete(cacheKey));
  return promise;
}

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
  siferry: 2_400,
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
  siferry: 12_000,
};
const DEFAULT_MAX_NEARBY_CAP_METERS = 6_000;

/**
 * The agencies a nearby search at this point could list: every agency without `stopBounds`, and
 * those whose stops come within their widest search radius. Only these need their timetables
 * downloaded first, which is most of a cold start.
 */
export function agenciesNear(lat: number, lon: number): AgencyId[] {
  return (Object.keys(AGENCY_CONFIGS) as AgencyId[]).filter((agencyId) =>
    stopsMayBeWithin(agencyId, lat, lon, MAX_NEARBY_CAP_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_CAP_METERS));
}

/**
 * The agencies that could have a transfer at any of these stops (a route's): every agency without
 * `stopBounds`, and those whose stops come within transfer distance of one of them. An agency left
 * out has no stop that close, so getRouteTransfers' answer is the same without its timetables.
 */
export function agenciesNearStops(stops: readonly { lat: number; lon: number }[]): AgencyId[] {
  return (Object.keys(AGENCY_CONFIGS) as AgencyId[]).filter((agencyId) =>
    !agencyConfig(agencyId).stopBounds || stops.some((stop) => stopsMayBeWithin(agencyId, stop.lat, stop.lon, STATION_TRANSFER_METERS)));
}

/** One agency's data as a nearby search reads it: its stations, and each route's names and served stops. */
export type NearbyAgencyData = { stations: readonly NearbyStation[]; route(routeId: string): Promise<NearbyRouteInfo | null> };

/**
 * Where a nearby search reads agencies from: this instance's timetables (liveNearbySource) or the
 * nearby index saved each night (gtfsNearbyIndex.ts), which give the same answer.
 */
export type NearbyDataSource = {
  /** False only when the agency surely has no station within `radius` meters of the point. */
  mayHaveStationsWithin(agencyId: AgencyId, lat: number, lon: number, radius: number): boolean | Promise<boolean>;
  /** The agency's data, or null when this instance can't read it. */
  load(agencyId: AgencyId): Promise<NearbyAgencyData | null>;
};

/**
 * Nearby data from the timetables on this instance, readied first by `prepare` when given (a few
 * downloads at a time: every agency at once could buffer too many ZIPs for a 1 GiB instance).
 */
export function liveNearbySource(prepare?: (agencyId: AgencyId) => Promise<void>, preparing = 3): NearbyDataSource {
  let running = 0;
  const waiting: (() => void)[] = [];
  const limited = async (agencyId: AgencyId) => {
    // A finished download hands its slot straight to the next one waiting.
    if (running >= preparing) await new Promise<void>((resolve) => waiting.push(resolve));
    else running += 1;
    try {
      await prepare?.(agencyId);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
  return {
    mayHaveStationsWithin: stopsMayBeWithin,
    async load(agencyId) {
      if (prepare) await limited(agencyId);
      if (!isAgencyAvailable(agencyId)) return null;
      return { stations: await agencyStations(agencyId), route: (routeId) => liveRouteInfo(agencyId, routeId) };
    },
  };
}

/** Whether the agency's stop bounds (if it has any) come within `radius` meters of the point. */
function stopsMayBeWithin(agencyId: AgencyId, lat: number, lon: number, radius: number): boolean {
  const bounds = agencyConfig(agencyId).stopBounds;
  if (!bounds) return true;
  const nearestLat = Math.min(Math.max(lat, bounds.south), bounds.north);
  const nearestLon = Math.min(Math.max(lon, bounds.west), bounds.east);
  return haversineMeters(lat, lon, nearestLat, nearestLon) <= radius;
}

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

/** Each line once, its nearest copy: MTA's borough bus feeds overlap (see searchRoutes). */
function onePerLine(routes: DiscoveredRoute[]): DiscoveredRoute[] {
  const nearest = new Map<string, DiscoveredRoute>();
  for (const route of routes) {
    const key = `${agencyConfig(route.agencyId).displayName}:${route.routeId}`;
    const kept = nearest.get(key);
    if (!kept || route.distanceMeters < kept.distanceMeters) nearest.set(key, route);
  }
  return [...nearest.values()];
}

/**
 * Real routes, on every configured agency, near a point (see pickNearbyRoutes for which). Starts
 * from each agency's base "nearby" radius; when fewer than MIN_NEARBY_ROUTES routes are that
 * close, widens in passes (NEARBY_PASS_MULTIPLIERS, capped per agency) only until enough are
 * found. Each route is resolved (its own nearest stop per direction) at most once across passes.
 * One entry per (agency, route_id), ordered by distance. Adding an agency to gtfsAgencies.ts makes
 * it show up here automatically.
 */
export async function findNearbyTransit(
  lat: number,
  lon: number,
  limit = MAX_NEARBY_ROUTES,
  source: NearbyDataSource = liveNearbySource(),
): Promise<DiscoveredRoute[]> {
  const allAgencyIds = Object.keys(AGENCY_CONFIGS) as AgencyId[];
  const baseRadius = (agencyId: AgencyId) => MAX_NEARBY_DISTANCE_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_DISTANCE_METERS;
  const capRadius = (agencyId: AgencyId) => MAX_NEARBY_CAP_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_CAP_METERS;
  // Each agency is read only once a pass could reach one of its stations, so a wide pass (and its
  // far-away agencies) costs nothing when the close ones already gave enough routes. Null: the
  // agency has no data here (an on-demand one not yet published) and is skipped.
  const agencies = new Map<AgencyId, Promise<{ data: NearbyAgencyData; candidates: NearbyStop[] } | null>>();
  const readAgency = (agencyId: AgencyId) => {
    let agency = agencies.get(agencyId);
    if (!agency) {
      agency = source.load(agencyId).then((data) => data && { data, candidates: nearestStations(data.stations, lat, lon, CANDIDATE_STOPS_PER_AGENCY) });
      agencies.set(agencyId, agency);
    }
    return agency;
  };
  // `${agencyId}:${routeId}` -> resolved route (null if it has no usable stop), across passes.
  const resolved = new Map<string, DiscoveredRoute | null>();

  const resolvedWithin = (multiplier: number) => onePerLine([...resolved.values()].filter((route): route is DiscoveredRoute => (
    route !== null && route.distanceMeters <= Math.min(baseRadius(route.agencyId) * multiplier, capRadius(route.agencyId))
  )));

  let base: DiscoveredRoute[] = [];
  let wider: DiscoveredRoute[] = [];
  for (const multiplier of NEARBY_PASS_MULTIPLIERS) {
    const radius = (agencyId: AgencyId) => Math.min(baseRadius(agencyId) * multiplier, capRadius(agencyId));
    const reachable = await Promise.all(allAgencyIds.map(async (agencyId) => (await source.mayHaveStationsWithin(agencyId, lat, lon, radius(agencyId)) ? agencyId : null)));
    const read = await Promise.all(reachable.map(async (agencyId) => {
      const agency = agencyId && await readAgency(agencyId);
      return agencyId && agency ? { agencyId, ...agency } : null;
    }));
    // Resolving candidates concurrently means a pass takes as long as its slowest route, not the sum.
    await Promise.all(
      read.flatMap((agency) => {
        if (!agency) return [];
        const { agencyId, data, candidates } = agency;
        const routeIds = new Set<string>();
        for (const stop of candidates) {
          if (stop.distanceMeters <= radius(agencyId)) for (const routeId of stop.routeIds) routeIds.add(routeId);
        }
        return [...routeIds]
          .filter((routeId) => !resolved.has(`${agencyId}:${routeId}`))
          .map(async (routeId) => {
            resolved.set(`${agencyId}:${routeId}`, null);
            const route = await data.route(routeId);
            resolved.set(`${agencyId}:${routeId}`, route ? describeRouteAt(agencyId, route, lat, lon) : null);
          });
      }),
    );
    if (multiplier === 1) base = resolvedWithin(1);
    wider = resolvedWithin(multiplier);
    if (wider.length >= MIN_NEARBY_ROUTES) break;
  }

  return pickNearbyRoutes(base, wider, MIN_NEARBY_ROUTES, Math.min(limit, MAX_NEARBY_ROUTES));
}
