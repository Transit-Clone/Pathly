import { parse } from 'csv-parse';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve, sep } from 'path';
import { logger } from 'firebase-functions';

import { AGENCY_CONFIGS, agencyConfig, type AgencyId } from './gtfsAgencies';
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
import { downloadRouteFile, hydrateCurrentGtfsSnapshot, ROUTE_FILES_INDEX, type RouteFileIndex } from './gtfsSnapshots';
import type { RouteGeometry } from './gtfsGeometry';
import { displayTransitName } from './transitNames';

export { gtfsTimeToSeconds } from './gtfsFeed';
export type { GtfsCalendar, GtfsRoute, GtfsStop, GtfsStopTime, GtfsTrip, ShapePoint } from './gtfsFeed';

const STATIC_DATA_ROOT = join(__dirname, '../static_data');
const activeDataRoots = new Map<AgencyId, { dataDir: string; version: string; routeFilesPrefix?: string }>();

/**
 * Whether an agency's timetable can be read on this instance. Every agency with a committed copy
 * always can; an on-demand agency (no committed copy) only once its snapshot is hydrated.
 */
export function isAgencyAvailable(agencyId: AgencyId): boolean {
  const root = activeDataRoots.get(agencyId);
  if (root) return existsSync(join(root.dataDir, 'routes.txt'));
  return !agencyConfig(agencyId).onDemandRouteFiles && existsSync(join(STATIC_DATA_ROOT, agencyConfig(agencyId).dataDir, 'routes.txt'));
}

/** The configured agencies whose timetables this instance can read (call after preparing them). */
export function availableAgencyIds(): AgencyId[] {
  return (Object.keys(AGENCY_CONFIGS) as AgencyId[]).filter(isAgencyAvailable);
}

// ---------------------------------------------------------------------------------------------
// On-demand route files: an agency whose snapshot carries a route-files prefix reads each route's
// prepared stop times and geometry from Cloud Storage the first time it's needed, verified against
// the core archive's route-files.json, and keeps the parsed results in a bounded LRU.

/** Stop-time rows kept across all on-demand routes (about 100 bytes each when parsed). */
const ON_DEMAND_ROW_BUDGET = 1_500_000;
/** Route geometries kept across all on-demand routes. */
const ON_DEMAND_GEOMETRY_ROUTES = 300;

const routeFileIndexes = new Map<AgencyId, Promise<RouteFileIndex | null>>();

function routeFileIndex(agencyId: AgencyId): Promise<RouteFileIndex | null> {
  let index = routeFileIndexes.get(agencyId);
  if (!index) {
    const path = join(dataDirFor(agencyId), DERIVED_DIR, ROUTE_FILES_INDEX);
    index = existsSync(path) ? readFile(path, 'utf-8').then((text) => JSON.parse(text) as RouteFileIndex) : Promise.resolve(null);
    routeFileIndexes.set(agencyId, index);
  }
  return index;
}

function isOnDemand(agencyId: AgencyId): boolean {
  return activeDataRoots.get(agencyId)?.routeFilesPrefix !== undefined;
}

/**
 * A route's prepared file ("stop_times/<route>.json" or "geometry/<route>.json"): on disk for
 * agencies hydrated whole, from Cloud Storage for on-demand ones. Null when the route has none.
 */
async function readPreparedRouteFile(agencyId: AgencyId, dir: string, routeId: string): Promise<string | null> {
  const name = `${dir}/${routeFileName(routeId)}`;
  const root = activeDataRoots.get(agencyId);
  if (root?.routeFilesPrefix !== undefined) {
    const expected = (await routeFileIndex(agencyId))?.[name];
    if (!expected) return null;
    try {
      return (await downloadRouteFile(`${root.routeFilesPrefix}/${name}`, expected)).toString('utf-8');
    } catch (error) {
      logger.warn('Could not load an on-demand GTFS route file', {
        agencyId,
        event: 'gtfs_route_file_failed',
        file: name,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  const path = join(dataDirFor(agencyId), DERIVED_DIR, dir, routeFileName(routeId));
  return existsSync(path) ? readFile(path, 'utf-8') : null;
}

type LruEntry<T> = { promise: Promise<T>; weight: number };

/** Least-recently-used promises, evicted once their summed weight passes `budget`. */
export class WeightedLru<T> {
  private readonly entries = new Map<string, LruEntry<T>>();
  private total = 0;

  constructor(private readonly budget: number, private readonly weigh: (value: T) => number) {}

  get(key: string): Promise<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.promise;
  }

  set(key: string, promise: Promise<T>): void {
    const entry: LruEntry<T> = { promise, weight: 0 };
    this.entries.set(key, entry);
    promise.then((value) => {
      if (this.entries.get(key) !== entry) return;
      entry.weight = this.weigh(value);
      this.total += entry.weight;
      for (const [oldKey, old] of this.entries) {
        if (this.total <= this.budget || old === entry) break;
        this.entries.delete(oldKey);
        this.total -= old.weight;
      }
    }, () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
  }

  deleteWhere(matches: (key: string) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (!matches(key)) continue;
      this.entries.delete(key);
      this.total -= entry.weight;
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

const onDemandStopTimes = new WeightedLru<RouteStopTimes>(ON_DEMAND_ROW_BUDGET, (times) => [...times.byTrip.values()].reduce((sum, rows) => sum + rows.length, 0));
const onDemandGeometry = new WeightedLru<DerivedRouteGeometry | null>(ON_DEMAND_GEOMETRY_ROUTES, () => 1);

/** Unit-test introspection only: how many on-demand routes' stop times are cached. */
export function onDemandCachedRoutesForTests(): number {
  return onDemandStopTimes.size;
}

/** Unit-test dependency injection only: an agency's active data as if hydrated from a snapshot. */
export function setAgencyDataForTests(agencyId: AgencyId, dataDir: string, routeFilesPrefix?: string): void {
  activeDataRoots.set(agencyId, { dataDir, version: `test-${dataDir}`, ...(routeFilesPrefix ? { routeFilesPrefix } : {}) });
  clearAgencyCaches(agencyId);
}

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
  if (isOnDemand(agencyId)) {
    const cachedOnDemand = onDemandStopTimes.get(cacheKey);
    if (cachedOnDemand) return cachedOnDemand;
    const promise = readPreparedRouteFile(agencyId, STOP_TIMES_DIR, routeId).then((text) => (
      text ? indexStopTimeRows((JSON.parse(text) as { rows: DerivedStopTimeRow[] }).rows) : { byStop: new Map(), byTrip: new Map() }
    ));
    onDemandStopTimes.set(cacheKey, promise);
    return promise;
  }
  const cached = routeStopTimesCache.get(cacheKey);
  if (cached) return cached;

  // Prepared per-route file: read just this route instead of scanning the whole feed.
  if (useDerived(agencyId)) {
    const promise = readPreparedRouteFile(agencyId, STOP_TIMES_DIR, routeId).then((text) => (
      text ? indexStopTimeRows((JSON.parse(text) as { rows: DerivedStopTimeRow[] }).rows) : { byStop: new Map(), byTrip: new Map() }
    ));
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
function displayDirection(geometry: RouteGeometry | null): RouteGeometry | null {
  if (!geometry) return null;
  return { ...geometry, headsign: displayTransitName(geometry.headsign), stops: geometry.stops.map((stop) => ({ ...stop, name: displayTransitName(stop.name) })) };
}

function displayGeometry(geometry: DerivedRouteGeometry): DerivedRouteGeometry {
  return { 0: displayDirection(geometry[0]), 1: displayDirection(geometry[1]) };
}

export function loadPreparedRouteGeometry(agencyId: AgencyId, routeId: string): Promise<DerivedRouteGeometry | null> | undefined {
  if (!useDerived(agencyId)) return undefined;
  const cacheKey = `${agencyId}:${routeId}`;
  const onDemand = isOnDemand(agencyId);
  const cached = onDemand ? onDemandGeometry.get(cacheKey) : routeGeometryCache.get(cacheKey);
  if (cached) return cached;
  // Files built before names were recased still carry all-caps bus names; they're recased here.
  const promise = readPreparedRouteFile(agencyId, GEOMETRY_DIR, routeId).then((text) => (text ? displayGeometry(JSON.parse(text) as DerivedRouteGeometry) : null));
  if (onDemand) onDemandGeometry.set(cacheKey, promise);
  else routeGeometryCache.set(cacheKey, promise);
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
  routeFileIndexes.delete(agencyId);
  onDemandStopTimes.deleteWhere((key) => key.startsWith(`${agencyId}:`));
  onDemandGeometry.deleteWhere((key) => key.startsWith(`${agencyId}:`));
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
  // An on-demand agency has no committed copy to fall back to: without a snapshot it stays
  // unavailable (isAgencyAvailable), and callers skip it.
  if (!snapshot && agencyConfig(agencyId).onDemandRouteFiles) return;
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
  routeFileIndexes.clear();
  onDemandStopTimes.deleteWhere(() => true);
  onDemandGeometry.deleteWhere(() => true);
  derivedValidity.clear();
  staticDataCache.clear();
  routeStopTimesCache.clear();
  routeGeometryCache.clear();
  agencyStopIndexesCache.clear();
  shapesCache.clear();
  pendingStopTimeBatches.clear();
}
