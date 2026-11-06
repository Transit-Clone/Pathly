import { logger } from 'firebase-functions';

import { haversineMeters } from './geo';
import type { AgencyId } from './gtfsAgencies';
import {
  agencyStations,
  liveRouteInfo,
  type NearbyAgencyData,
  type NearbyDataSource,
  type NearbyRouteInfo,
  type NearbyStation,
  type ServedDirection,
} from './gtfsDiscovery';
import { currentSnapshotVersion, readNearbyIndexObject, saveNearbyIndexObject } from './gtfsSnapshots';
import { agencySnapshotVersion, loadAgencyStaticData } from './gtfsStaticData';

/**
 * The nearby index: everything a nearby search reads from an agency (its stations, and each
 * route's names, color, headsigns and regularly served stops), saved by the daily refresh. A
 * search reads one small file per agency it reaches instead of downloading that agency's whole
 * timetable, and computes the same answer from it: the same stations and stops in the same order,
 * with the rider-dependent parts (distances, the walk to each stop) still worked out per search.
 *
 * Alongside it, coverage.json says which 0.01° cells (about 1.1 km) hold each agency's stations,
 * so a search reads only the agencies that could have one within its radius.
 */

/** Bumped whenever the files' format or what's built into them changes; older files are then ignored. */
export const NEARBY_INDEX_FORMAT = 1;
const COVERAGE_FILE = 'coverage.json';
const CELLS_PER_DEGREE = 100;
/** Saved routes are resolved a few at a time while building (on-demand agencies download each route's geometry). */
const BUILD_CONCURRENCY = 8;
/** How long an instance keeps the coverage file before checking for a newer one. */
const COVERAGE_RECHECK_MS = 5 * 60_000;

type EncodedStop = [stopId: string, name: string, lat: number, lon: number];
type EncodedDirection = [headsign: string | null, stops: [stop: number, stopsAhead: number | null][]];
type EncodedRoute = [routeId: string, name: string, shortName: string, color: string, direction0: EncodedDirection, direction1: EncodedDirection];
type EncodedAgency = {
  format: number;
  agencyId: AgencyId;
  snapshotVersion: string;
  stops: EncodedStop[];
  stations: [stop: number, routeIds: string[]][];
  routes: EncodedRoute[];
};
type Coverage = {
  format: number;
  builtAt: string;
  /** Per agency, the snapshot its file was built from and its stations' cells, as [latCell, lonCell, ...]. */
  agencies: Partial<Record<AgencyId, { snapshotVersion: string; cells: number[] }>>;
};

/** One agency's index, from the timetable loaded on this instance (which the caller has prepared). */
export async function buildAgencyNearbyIndex(agencyId: AgencyId, snapshotVersion: string): Promise<{ file: EncodedAgency; cells: number[] }> {
  const stations = await agencyStations(agencyId);
  const { routesById } = loadAgencyStaticData(agencyId);
  const routeIds = [...new Set(stations.flatMap((station) => station.routeIds))].filter((routeId) => routesById.has(routeId));

  const routes: (NearbyRouteInfo | null)[] = new Array(routeIds.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, async () => {
    for (let index = next++; index < routeIds.length; index = next++) routes[index] = await liveRouteInfo(agencyId, routeIds[index]!);
  }));

  const stops: EncodedStop[] = [];
  const stopIndex = new Map<string, number>();
  const stopRef = (stopId: string, name: string, lat: number, lon: number) => {
    let index = stopIndex.get(stopId);
    if (index === undefined) {
      index = stops.push([stopId, name, lat, lon]) - 1;
      stopIndex.set(stopId, index);
    }
    return index;
  };
  const encodeDirection = ({ headsign, stops: served }: ServedDirection): EncodedDirection =>
    [headsign, served.map((stop) => [stopRef(stop.stopId, stop.name, stop.lat, stop.lon), stop.stopsAhead])];

  const file: EncodedAgency = {
    format: NEARBY_INDEX_FORMAT,
    agencyId,
    snapshotVersion,
    stops,
    stations: stations.map((station) => [stopRef(station.stopId, station.stopName, station.lat, station.lon), station.routeIds]),
    routes: routes.filter((route): route is NearbyRouteInfo => route !== null).map((route) => [
      route.routeId, route.name, route.shortName, route.color, encodeDirection(route.directions[0]), encodeDirection(route.directions[1]),
    ]),
  };
  return { file, cells: coverageCells(stations) };
}

/** The 0.01° cells holding these stations, as [latCell, lonCell, ...]. */
export function coverageCells(stations: readonly { lat: number; lon: number }[]): number[] {
  const cells = new Set<string>();
  for (const station of stations) cells.add(`${Math.floor(station.lat * CELLS_PER_DEGREE)},${Math.floor(station.lon * CELLS_PER_DEGREE)}`);
  return [...cells].flatMap((cell) => cell.split(',').map(Number));
}

/** Whether any of these cells comes within `radius` meters of the point (a station there might). */
export function cellsMayBeWithin(cells: readonly number[], lat: number, lon: number, radius: number): boolean {
  // A meter of slack for rounding at cell edges.
  const reach = radius + 1;
  const latReach = reach / 111_000;
  for (let index = 0; index < cells.length; index += 2) {
    const south = cells[index]! / CELLS_PER_DEGREE;
    const nearestLat = Math.min(Math.max(lat, south), south + 1 / CELLS_PER_DEGREE);
    if (Math.abs(nearestLat - lat) > latReach) continue;
    const west = cells[index + 1]! / CELLS_PER_DEGREE;
    const nearestLon = Math.min(Math.max(lon, west), west + 1 / CELLS_PER_DEGREE);
    if (haversineMeters(lat, lon, nearestLat, nearestLon) <= reach) return true;
  }
  return false;
}

/** The search's view of a saved agency file. */
export function decodeAgencyNearbyIndex(file: EncodedAgency): NearbyAgencyData {
  const stop = (index: number) => {
    const [stopId, name, lat, lon] = file.stops[index]!;
    return { stopId, name, lat, lon };
  };
  const stations: NearbyStation[] = file.stations.map(([index, routeIds]) => {
    const { stopId, name, lat, lon } = stop(index);
    return { stopId, stopName: name, lat, lon, routeIds };
  });
  const decodeDirection = ([headsign, served]: EncodedDirection): ServedDirection =>
    ({ headsign, stops: served.map(([index, stopsAhead]) => ({ ...stop(index), stopsAhead })) });
  const encodedRoutes = new Map(file.routes.map((route) => [route[0], route]));
  return {
    stations,
    route: async (routeId) => {
      const route = encodedRoutes.get(routeId);
      if (!route) return null;
      const [, name, shortName, color, direction0, direction1] = route;
      return { routeId, name, shortName, color, directions: { 0: decodeDirection(direction0), 1: decodeDirection(direction1) } };
    },
  };
}

/**
 * Builds and saves every given agency's index from this instance's loaded timetables (the daily
 * refresh, after preparing them), then the coverage file naming them. An agency that fails, or
 * was read from the committed copy rather than a snapshot, is left out: searches near it read its
 * timetable as before.
 */
export async function saveNearbyIndex(agencyIds: readonly AgencyId[]): Promise<{ saved: AgencyId[]; bytes: number }> {
  const coverage: Coverage = { format: NEARBY_INDEX_FORMAT, builtAt: new Date().toISOString(), agencies: {} };
  let bytes = 0;
  for (const agencyId of agencyIds) {
    const snapshotVersion = agencySnapshotVersion(agencyId);
    if (!snapshotVersion) continue;
    try {
      const { file, cells } = await buildAgencyNearbyIndex(agencyId, snapshotVersion);
      const body = JSON.stringify(file);
      await saveNearbyIndexObject(`${agencyId}.json`, body);
      bytes += body.length;
      coverage.agencies[agencyId] = { snapshotVersion, cells };
    } catch (error) {
      logger.warn('Could not build an agency nearby index', { agencyId, event: 'nearby_index_agency_failed', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const saved = Object.keys(coverage.agencies) as AgencyId[];
  if (saved.length === 0) throw new Error('no agency nearby index was built');
  // Last, so coverage only ever names files already saved.
  await saveNearbyIndexObject(COVERAGE_FILE, JSON.stringify(coverage));
  return { saved, bytes };
}

let coverageCache: { readAtMs: number; coverage: Promise<Coverage | null> } | undefined;
const agencyCache = new Map<AgencyId, { snapshotVersion: string; data: Promise<NearbyAgencyData | null> }>();

function readCoverage(nowMs: number): Promise<Coverage | null> {
  if (coverageCache && nowMs - coverageCache.readAtMs < COVERAGE_RECHECK_MS) return coverageCache.coverage;
  const coverage = readNearbyIndexObject(COVERAGE_FILE).then((text) => {
    if (!text) return null;
    const parsed = JSON.parse(text) as Coverage;
    return parsed.format === NEARBY_INDEX_FORMAT && parsed.agencies ? parsed : null;
  }).catch(() => null);
  coverageCache = { readAtMs: nowMs, coverage };
  return coverage;
}

function readAgency(agencyId: AgencyId, snapshotVersion: string): Promise<NearbyAgencyData | null> {
  const cached = agencyCache.get(agencyId);
  if (cached?.snapshotVersion === snapshotVersion) return cached.data;
  const data = readNearbyIndexObject(`${agencyId}.json`).then((text) => {
    if (!text) return null;
    const file = JSON.parse(text) as EncodedAgency;
    return file.format === NEARBY_INDEX_FORMAT && file.agencyId === agencyId && file.snapshotVersion === snapshotVersion ? decodeAgencyNearbyIndex(file) : null;
  }).catch(() => null);
  agencyCache.set(agencyId, { snapshotVersion, data });
  // A failed read is retried by the next search rather than kept.
  void data.then((value) => {
    if (value === null && agencyCache.get(agencyId)?.data === data) agencyCache.delete(agencyId);
  });
  return data;
}

/**
 * Nearby data from the saved index where it's current: for each agency whose file was built from
 * the snapshot now published. Any other agency (no file, an older snapshot, a failed read) comes
 * from `fallback`, the timetables.
 */
export async function nearbyIndexSource(fallback: NearbyDataSource, nowMs = Date.now()): Promise<NearbyDataSource> {
  const coverage = await readCoverage(nowMs);
  if (!coverage) return fallback;
  const current = async (agencyId: AgencyId) => {
    const entry = coverage.agencies[agencyId];
    return entry && (await currentSnapshotVersion(agencyId, nowMs)) === entry.snapshotVersion ? entry : null;
  };
  return {
    async mayHaveStationsWithin(agencyId, lat, lon, radius) {
      const entry = await current(agencyId);
      return entry ? cellsMayBeWithin(entry.cells, lat, lon, radius) : fallback.mayHaveStationsWithin(agencyId, lat, lon, radius);
    },
    async load(agencyId) {
      const entry = await current(agencyId);
      const data = entry ? await readAgency(agencyId, entry.snapshotVersion) : null;
      return data ?? fallback.load(agencyId);
    },
  };
}

/** Unit-test isolation only. */
export function resetNearbyIndexStateForTests(): void {
  coverageCache = undefined;
  agencyCache.clear();
}
