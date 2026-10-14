import { parse } from 'csv-parse';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve, sep } from 'path';
import { logger } from 'firebase-functions';

import { agencyConfig, type AgencyId } from './gtfsAgencies';
import {
  DERIVED_DIR,
  DERIVED_VERSION,
  GEOMETRY_DIR,
  MANIFEST_FILE,
  STOP_INDEXES_FILE,
  STOP_TIMES_DIR,
  derivedSources,
  indexStopTimeRows,
  routeFileName,
  type DerivedManifest,
  type DerivedRouteGeometry,
  type DerivedStopIndexes,
  type DerivedStopTimeRow,
  type RouteStopTimes,
} from './gtfsDerived';
import { readAgencyStaticData, readShapes, type AgencyStaticData, type GtfsStopTime, type ShapePoint, type StopTimeRow } from './gtfsFeed';
import { hydrateCurrentGtfsSnapshot } from './gtfsSnapshots';

export { gtfsTimeToSeconds } from './gtfsFeed';
export type { GtfsCalendar, GtfsRoute, GtfsStop, GtfsStopTime, GtfsTrip, ShapePoint } from './gtfsFeed';

const STATIC_DATA_ROOT = join(__dirname, '../static_data');
const activeDataRoots = new Map<AgencyId, { dataDir: string; version: string }>();

function dataDirFor(agencyId: AgencyId): string {
  return activeDataRoots.get(agencyId)?.dataDir ?? join(STATIC_DATA_ROOT, agencyConfig(agencyId).dataDir);
}

const derivedValidity = new Map<AgencyId, boolean>();

/**
 * Whether this agency's prepared timetable files (scripts/build-gtfs-index.js) can be used
 * instead of scanning stop_times.txt: present, current format, and built from the feed files on
 * disk. Deploys leave the raw stop_times.txt out (its prepared files are verified at deploy
 * time), and file times aren't guaranteed to survive the upload — so without stop_times.txt the
 * prepared files are the only data and are always used. Checked once per agency per instance.
 * `GTFS_DERIVED_DISABLED=1` forces the scan (for comparing the two paths).
 */
function useDerived(agencyId: AgencyId): boolean {
  if (process.env.GTFS_DERIVED_DISABLED === '1') return false;
  const cached = derivedValidity.get(agencyId);
  if (cached !== undefined) return cached;
  let valid = false;
  const dataDir = dataDirFor(agencyId);
  const manifestPath = join(dataDir, DERIVED_DIR, MANIFEST_FILE);
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as DerivedManifest;
      const current = derivedSources(dataDir);
      valid = manifest.version === DERIVED_VERSION && (
        current['stop_times.txt'] === null
        || (Object.keys(current) as (keyof typeof current)[]).every((file) => JSON.stringify(current[file]) === JSON.stringify(manifest.sources[file]))
      );
    } catch {
      valid = false;
    }
  }
  derivedValidity.set(agencyId, valid);
  return valid;
}

const staticDataCache = new Map<AgencyId, AgencyStaticData>();

/** Loads and indexes one agency's small-to-medium static GTFS files (not stop_times.txt — see loadRouteStopTimes/loadGlobalStopRouteIndex, both sized for files too big to load whole). Cached per agency. */
export function loadAgencyStaticData(agencyId: AgencyId): AgencyStaticData {
  const cached = staticDataCache.get(agencyId);
  if (cached) return cached;

  const data = readAgencyStaticData(dataDirFor(agencyId));
  staticDataCache.set(agencyId, data);
  return data;
}

/**
 * True if `serviceId` runs on `dateKey` ("YYYYMMDD") — an exact calendar_dates.txt exception
 * wins if one exists for that date; otherwise falls back to calendar.txt's weekly pattern.
 * Agencies that publish via calendar_dates.txt alone (no calendar.txt entries at all, like
 * LIRR) naturally reduce to "exception-only": with no weekly pattern to fall back to, a date
 * with no explicit exception is correctly treated as not running.
 */
export function isServiceRunningOn(agencyId: AgencyId, serviceId: string, dateKey: string, dayOfWeek: number): boolean {
  const { calendarByService, calendarExceptionsByService } = loadAgencyStaticData(agencyId);

  const exception = calendarExceptionsByService.get(serviceId)?.get(dateKey);
  if (exception === '1') return true;
  if (exception === '2') return false;

  const calendar = calendarByService.get(serviceId);
  if (!calendar) return false;
  if (dateKey < calendar.startDate || dateKey > calendar.endDate) return false;
  return calendar.daysOfWeek[dayOfWeek] ?? false;
}

// Keyed by `${agencyId}:${routeId}`. Caches the in-flight *promise*, not just the resolved
// value — several callers (geometry, headsigns, platform lookup, predictions) can ask for the
// same route concurrently, and without this each would race to start its own redundant stream.
const routeStopTimesCache = new Map<string, Promise<RouteStopTimes>>();

/**
 * stop_times.txt can be the agency's entire system (NYC Subway: 565k+ rows, ~35 MB) — too big
 * to keep whole, so only requested routes' rows are kept, indexed both by stop_id (predictions
 * at a stop) and by trip_id (one trip's ordered station sequence). Routes requested in the same
 * tick are batched into a single streaming pass per agency: nearby discovery asks for dozens of
 * routes at once, and streaming the full file once per route made a cold Midtown search take
 * ~110 s. Cached per agency+route after the first call.
 */
export function loadRouteStopTimes(agencyId: AgencyId, routeId: string): Promise<RouteStopTimes> {
  const cacheKey = `${agencyId}:${routeId}`;
  const cached = routeStopTimesCache.get(cacheKey);
  if (cached) return cached;

  // Prepared per-route file: read just this route instead of scanning the whole feed.
  if (useDerived(agencyId)) {
    const path = join(dataDirFor(agencyId), DERIVED_DIR, STOP_TIMES_DIR, routeFileName(routeId));
    const promise = existsSync(path)
      ? readFile(path, 'utf-8').then((text) => indexStopTimeRows((JSON.parse(text) as { rows: DerivedStopTimeRow[] }).rows))
      : Promise.resolve<RouteStopTimes>({ byStop: new Map(), byTrip: new Map() });
    routeStopTimesCache.set(cacheKey, promise);
    return promise;
  }

  let batch = pendingStopTimeBatches.get(agencyId);
  if (!batch) {
    const routeIds = new Set<string>();
    let resolveBatch!: (result: Map<string, RouteStopTimes>) => void;
    let rejectBatch!: (error: unknown) => void;
    const done = new Promise<Map<string, RouteStopTimes>>((resolve, reject) => {
      resolveBatch = resolve;
      rejectBatch = reject;
    });
    batch = { routeIds, done };
    pendingStopTimeBatches.set(agencyId, batch);
    // Next macrotask: lets every caller in the current burst join this batch first.
    setImmediate(() => {
      pendingStopTimeBatches.delete(agencyId);
      void streamStopTimesForRoutes(agencyId, routeIds).then(resolveBatch, rejectBatch);
    });
  }
  batch.routeIds.add(routeId);
  const promise = batch.done.then((byRoute) => byRoute.get(routeId) ?? { byStop: new Map(), byTrip: new Map() });
  routeStopTimesCache.set(cacheKey, promise);
  return promise;
}

export type RouteStopCounts = Record<0 | 1, Map<string, number>>;
type AgencyStopIndexes = {
  routeIdsByStop: Map<string, Set<string>>;
  stopCountsByRoute: Map<string, RouteStopCounts>;
};

const agencyStopIndexesCache = new Map<AgencyId, Promise<AgencyStopIndexes>>();

type StopTimeBatch = { routeIds: Set<string>; done: Promise<Map<string, RouteStopTimes>> };
const pendingStopTimeBatches = new Map<AgencyId, StopTimeBatch>();

/** One pass over an agency's stop_times.txt, keeping only the given routes' rows. */
async function streamStopTimesForRoutes(agencyId: AgencyId, routeIds: ReadonlySet<string>): Promise<Map<string, RouteStopTimes>> {
  const { tripsById } = loadAgencyStaticData(agencyId);
  const routeOfTrip = new Map<string, string>();
  for (const trip of tripsById.values()) {
    if (routeIds.has(trip.routeId)) routeOfTrip.set(trip.tripId, trip.routeId);
  }

  const byRoute = new Map<string, RouteStopTimes>();
  for (const routeId of routeIds) byRoute.set(routeId, { byStop: new Map(), byTrip: new Map() });
  const path = join(dataDirFor(agencyId), 'stop_times.txt');
  if (!existsSync(path)) return byRoute;

  const parser = createReadStream(path).pipe(parse({ columns: true }));
  for await (const row of parser as AsyncIterable<StopTimeRow>) {
    const routeId = routeOfTrip.get(row.trip_id);
    if (!routeId) continue;
    const { byStop, byTrip } = byRoute.get(routeId)!;
    const entry: GtfsStopTime = {
      tripId: row.trip_id,
      stopId: row.stop_id,
      arrivalTime: row.arrival_time,
      departureTime: row.departure_time,
      stopSequence: Number(row.stop_sequence),
    };
    const stopList = byStop.get(row.stop_id);
    if (stopList) stopList.push(entry);
    else byStop.set(row.stop_id, [entry]);
    const tripList = byTrip.get(row.trip_id);
    if (tripList) tripList.push(entry);
    else byTrip.set(row.trip_id, [entry]);
  }
  return byRoute;
}

/**
 * Every route_id that calls at each stop_id, across an agency's whole system — for "what
 * lines serve this station" lookups (nearest-stop discovery), as opposed to
 * loadRouteStopTimes's one-route-at-a-time scope. Built once per agency (full file scan) and
 * cached (the in-flight promise, so concurrent callers share one scan) until that agency's
 * active static snapshot changes.
 */
function loadAgencyStopIndexes(agencyId: AgencyId): Promise<AgencyStopIndexes> {
  const cached = agencyStopIndexesCache.get(agencyId);
  if (cached) return cached;

  const promise = (async () => {
    if (useDerived(agencyId)) {
      // Ordered pairs, not objects: entry order breaks ties downstream, and JSON objects reorder
      // number-like keys (stop "14").
      const text = await readFile(join(dataDirFor(agencyId), DERIVED_DIR, STOP_INDEXES_FILE), 'utf-8');
      const prepared = JSON.parse(text) as DerivedStopIndexes;
      return {
        routeIdsByStop: new Map(prepared.routeIdsByStop.map(([stopId, routeIds]) => [stopId, new Set(routeIds)])),
        stopCountsByRoute: new Map(prepared.stopCountsByRoute.map(([routeId, byDirection]) => [routeId, { 0: new Map(byDirection[0]), 1: new Map(byDirection[1]) }])),
      };
    }
    const { tripsById } = loadAgencyStaticData(agencyId);
    const routeIdsByStop = new Map<string, Set<string>>();
    const stopCountsByRoute = new Map<string, RouteStopCounts>();
    const path = join(dataDirFor(agencyId), 'stop_times.txt');
    if (existsSync(path)) {
      const parser = createReadStream(path).pipe(parse({ columns: true }));
      for await (const row of parser as AsyncIterable<StopTimeRow>) {
        const trip = tripsById.get(row.trip_id);
        if (!trip) continue;
        const { routeId, directionId } = trip;
        const set = routeIdsByStop.get(row.stop_id);
        if (set) set.add(routeId);
        else routeIdsByStop.set(row.stop_id, new Set([routeId]));

        if (directionId !== 0 && directionId !== 1) continue;
        const counts = stopCountsByRoute.get(routeId) ?? { 0: new Map(), 1: new Map() };
        const directionCounts = counts[directionId];
        directionCounts.set(row.stop_id, (directionCounts.get(row.stop_id) ?? 0) + 1);
        stopCountsByRoute.set(routeId, counts);
      }
    }
    return { routeIdsByStop, stopCountsByRoute };
  })();

  agencyStopIndexesCache.set(agencyId, promise);
  return promise;
}

export async function loadGlobalStopRouteIndex(agencyId: AgencyId): Promise<Map<string, Set<string>>> {
  return (await loadAgencyStopIndexes(agencyId)).routeIdsByStop;
}

export async function loadRouteStopCounts(agencyId: AgencyId, routeId: string): Promise<RouteStopCounts> {
  return (await loadAgencyStopIndexes(agencyId)).stopCountsByRoute.get(routeId) ?? { 0: new Map(), 1: new Map() };
}

// Keyed by `${agencyId}:${routeId}`, like routeStopTimesCache.
const routeGeometryCache = new Map<string, Promise<DerivedRouteGeometry | null>>();

/**
 * A route's prepared geometry (both directions), or null when the route has no prepared file
 * (no stop times). Undefined when this agency has no usable prepared files, so the caller
 * computes geometry from the timetable instead.
 */
export function loadPreparedRouteGeometry(agencyId: AgencyId, routeId: string): Promise<DerivedRouteGeometry | null> | undefined {
  if (!useDerived(agencyId)) return undefined;
  const cacheKey = `${agencyId}:${routeId}`;
  const cached = routeGeometryCache.get(cacheKey);
  if (cached) return cached;
  const path = join(dataDirFor(agencyId), DERIVED_DIR, GEOMETRY_DIR, routeFileName(routeId));
  const promise = existsSync(path)
    ? readFile(path, 'utf-8').then((text) => JSON.parse(text) as DerivedRouteGeometry)
    : Promise.resolve(null);
  routeGeometryCache.set(cacheKey, promise);
  return promise;
}

const shapesCache = new Map<AgencyId, Map<string, ShapePoint[]>>();

/**
 * shape_id -> ordered points from an agency's shapes.txt (several MB each), loaded lazily the
 * first time that agency's geometry is requested and cached per instance — not part of
 * loadAgencyStaticData, so live predictions never pay for it.
 */
export function loadAgencyShapes(agencyId: AgencyId): Map<string, ShapePoint[]> {
  const cached = shapesCache.get(agencyId);
  if (cached) return cached;
  const shapes = readShapes(dataDirFor(agencyId));
  shapesCache.set(agencyId, shapes);
  return shapes;
}

function clearAgencyCaches(agencyId: AgencyId): void {
  derivedValidity.delete(agencyId);
  staticDataCache.delete(agencyId);
  agencyStopIndexesCache.delete(agencyId);
  shapesCache.delete(agencyId);
  pendingStopTimeBatches.delete(agencyId);
  for (const cache of [routeStopTimesCache, routeGeometryCache]) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${agencyId}:`)) cache.delete(key);
    }
  }
}

/**
 * Before an operation reads static GTFS, hydrate the latest validated Cloud Storage snapshot
 * into this instance's /tmp cache. Missing/unavailable storage deliberately keeps the bundled
 * deploy snapshot, so publishing the scheduler cannot create a cold-start outage.
 */
export async function prepareAgencyStaticData(agencyId: AgencyId, nowMs = Date.now()): Promise<void> {
  const snapshot = await hydrateCurrentGtfsSnapshot(agencyId, nowMs);
  const next = snapshot ?? {
    dataDir: join(STATIC_DATA_ROOT, agencyConfig(agencyId).dataDir),
    version: 'bundled',
  };
  const previous = activeDataRoots.get(agencyId);
  if (previous?.version === next.version) return;

  activeDataRoots.set(agencyId, next);
  clearAgencyCaches(agencyId);

  // Transit callables run with concurrency=1, so no earlier request can still be reading this
  // instance's prior root. Remove it from Cloud Run's in-memory /tmp to prevent daily versions
  // accumulating until the instance runs out of memory.
  if (previous && previous.version !== 'bundled') {
    const hydratedRoot = resolve(tmpdir(), 'pathly-gtfs');
    const previousDir = resolve(previous.dataDir);
    if (previousDir.startsWith(`${hydratedRoot}${sep}`)) {
      try {
        await rm(previousDir, { force: true, recursive: true });
      } catch (error) {
        logger.warn('Could not prune prior GTFS snapshot directory', {
          agencyId,
          event: 'gtfs_snapshot_prune_failed',
          reason: error instanceof Error ? error.message : String(error),
          version: previous.version,
        });
      }
    }
  }
}

/** Unit-test isolation only. */
export function resetGtfsStaticDataForTests(): void {
  activeDataRoots.clear();
  derivedValidity.clear();
  staticDataCache.clear();
  routeStopTimesCache.clear();
  routeGeometryCache.clear();
  agencyStopIndexesCache.clear();
  shapesCache.clear();
  pendingStopTimeBatches.clear();
}
