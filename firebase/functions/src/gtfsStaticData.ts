import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve, sep } from 'path';
import { logger } from 'firebase-functions';

import { agencyConfig, type AgencyId } from './gtfsAgencies';
import { hydrateCurrentGtfsSnapshot } from './gtfsSnapshots';

const STATIC_DATA_ROOT = join(__dirname, '../static_data');
const activeDataRoots = new Map<AgencyId, { dataDir: string; version: string }>();

/**
 * GTFS times are "HH:MM:SS" and can exceed 24:00:00 for a post-midnight trip of the same
 * service day. Shared by gtfsSchedule.ts and gtfsDiscovery.ts rather than defined twice —
 * both already depend on this module for the underlying stop/trip data.
 */
export function gtfsTimeToSeconds(hms: string): number {
  const parts = hms.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

function dataDirFor(agencyId: AgencyId): string {
  return activeDataRoots.get(agencyId)?.dataDir ?? join(STATIC_DATA_ROOT, agencyConfig(agencyId).dataDir);
}

function loadCsvSync<T>(agencyId: AgencyId, filename: string): T[] {
  const path = join(dataDirFor(agencyId), filename);
  if (!existsSync(path)) return [];
  return parseSync(readFileSync(path, 'utf-8'), { columns: true }) as T[];
}

type RouteRow = { route_id: string; route_short_name: string; route_long_name: string; route_color: string };
type StopRow = { stop_id: string; stop_name: string; stop_lat: string; stop_lon: string; parent_station?: string };
type TripRow = { trip_id: string; route_id: string; trip_headsign: string; direction_id: string; service_id: string; peak_offpeak?: string };
type StopTimeRow = { trip_id: string; stop_id: string; arrival_time: string; departure_time: string; stop_sequence: string };
type CalendarRow = {
  service_id: string;
  monday: string; tuesday: string; wednesday: string; thursday: string; friday: string; saturday: string; sunday: string;
  start_date: string; end_date: string;
};
type CalendarDateRow = { service_id: string; date: string; exception_type: string };

export type GtfsStop = { stopId: string; name: string; lat: number; lon: number; parentStation: string | null };
/** `peakOffpeak` is LIRR's own real schedule classification (trips.txt's peak_offpeak column) — null for agencies whose trips.txt doesn't have that column (e.g. subway, which doesn't have peak/off-peak fares at all). */
export type GtfsTrip = { tripId: string; routeId: string; headsign: string; directionId: number; serviceId: string; peakOffpeak: boolean | null };
export type GtfsRoute = { routeId: string; shortName: string; name: string; color: string };
/** One scheduled stop event from stop_times.txt — arrival/departure are "HH:MM:SS" local time, can exceed 24:00:00 for a post-midnight trip of the same service day. */
export type GtfsStopTime = { tripId: string; stopId: string; arrivalTime: string; departureTime: string; stopSequence: number };
/** A service_id's weekly pattern and the date range it's valid for — absent for agencies (like LIRR) that publish service exclusively via calendar_dates.txt exceptions. */
export type GtfsCalendar = { daysOfWeek: readonly boolean[]; startDate: string; endDate: string };

type AgencyStaticData = {
  routesById: Map<string, GtfsRoute>;
  stopsById: Map<string, GtfsStop>;
  tripsById: Map<string, GtfsTrip>;
  calendarByService: Map<string, GtfsCalendar>;
  /** service_id -> "YYYYMMDD" dates added (exception_type 1) or removed (exception_type 2) on top of the weekly pattern (or, for calendar.txt-less agencies, the *entire* schedule). */
  calendarExceptionsByService: Map<string, Map<string, '1' | '2'>>;
};

const staticDataCache = new Map<AgencyId, AgencyStaticData>();

/** Loads and indexes one agency's small-to-medium static GTFS files (not stop_times.txt — see loadRouteStopTimes/loadGlobalStopRouteIndex, both sized for files too big to load whole). Cached per agency. */
export function loadAgencyStaticData(agencyId: AgencyId): AgencyStaticData {
  const cached = staticDataCache.get(agencyId);
  if (cached) return cached;

  const routesById = new Map<string, GtfsRoute>();
  for (const row of loadCsvSync<RouteRow>(agencyId, 'routes.txt')) {
    // LIRR's routes.txt has no route_short_name column at all (not just blank) — fall all the
    // way back to the route_id itself rather than leaving this undefined.
    const shortName = row.route_short_name || row.route_long_name || row.route_id;
    routesById.set(row.route_id, { routeId: row.route_id, shortName, name: row.route_long_name || shortName, color: row.route_color });
  }

  const stopsById = new Map<string, GtfsStop>();
  for (const row of loadCsvSync<StopRow>(agencyId, 'stops.txt')) {
    stopsById.set(row.stop_id, {
      stopId: row.stop_id,
      name: row.stop_name,
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
      parentStation: row.parent_station || null,
    });
  }

  const tripsById = new Map<string, GtfsTrip>();
  for (const row of loadCsvSync<TripRow>(agencyId, 'trips.txt')) {
    tripsById.set(row.trip_id, {
      tripId: row.trip_id,
      routeId: row.route_id,
      headsign: row.trip_headsign,
      directionId: Number(row.direction_id),
      serviceId: row.service_id,
      peakOffpeak: row.peak_offpeak === undefined ? null : row.peak_offpeak === '1',
    });
  }

  const calendarByService = new Map<string, GtfsCalendar>();
  for (const row of loadCsvSync<CalendarRow>(agencyId, 'calendar.txt')) {
    calendarByService.set(row.service_id, {
      daysOfWeek: [row.sunday, row.monday, row.tuesday, row.wednesday, row.thursday, row.friday, row.saturday].map((v) => v === '1'),
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }

  const calendarExceptionsByService = new Map<string, Map<string, '1' | '2'>>();
  for (const row of loadCsvSync<CalendarDateRow>(agencyId, 'calendar_dates.txt')) {
    const exceptions = calendarExceptionsByService.get(row.service_id) ?? new Map<string, '1' | '2'>();
    exceptions.set(row.date, row.exception_type === '2' ? '2' : '1');
    calendarExceptionsByService.set(row.service_id, exceptions);
  }

  const data: AgencyStaticData = { routesById, stopsById, tripsById, calendarByService, calendarExceptionsByService };
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

type RouteStopTimes = { byStop: Map<string, GtfsStopTime[]>; byTrip: Map<string, GtfsStopTime[]> };

// Keyed by `${agencyId}:${routeId}`. Caches the in-flight *promise*, not just the resolved
// value — several callers (geometry, headsigns, platform lookup, predictions) can ask for the
// same route concurrently, and without this each would race to start its own redundant stream.
const routeStopTimesCache = new Map<string, Promise<RouteStopTimes>>();

/**
 * stop_times.txt can be the agency's entire system (NYC Subway: 565k+ rows) — too big to load
 * whole for every agency, so this always streams it once per route_id and keeps only that
 * route's rows, indexed both by stop_id (for predictions at a given stop) and by trip_id (for
 * reconstructing one trip's full ordered station sequence). For a small agency (LIRR) this is
 * just as correct, only faster — there's no separate "small agency" code path. Cached per
 * agency+route after the first call.
 */
export function loadRouteStopTimes(agencyId: AgencyId, routeId: string): Promise<RouteStopTimes> {
  const cacheKey = `${agencyId}:${routeId}`;
  const cached = routeStopTimesCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const { tripsById } = loadAgencyStaticData(agencyId);
    const relevantTripIds = new Set<string>();
    for (const trip of tripsById.values()) {
      if (trip.routeId === routeId) relevantTripIds.add(trip.tripId);
    }

    const byStop = new Map<string, GtfsStopTime[]>();
    const byTrip = new Map<string, GtfsStopTime[]>();
    const path = join(dataDirFor(agencyId), 'stop_times.txt');
    if (existsSync(path)) {
      const parser = createReadStream(path).pipe(parse({ columns: true }));
      for await (const row of parser as AsyncIterable<StopTimeRow>) {
        if (!relevantTripIds.has(row.trip_id)) continue;
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
    }

    return { byStop, byTrip };
  })();

  routeStopTimesCache.set(cacheKey, promise);
  return promise;
}

export type RouteStopCounts = Record<0 | 1, Map<string, number>>;
type AgencyStopIndexes = {
  routeIdsByStop: Map<string, Set<string>>;
  stopCountsByRoute: Map<string, RouteStopCounts>;
};

const agencyStopIndexesCache = new Map<AgencyId, Promise<AgencyStopIndexes>>();

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
    const { tripsById } = loadAgencyStaticData(agencyId);
    const routeIdsByStop = new Map<string, Set<string>>();
    const stopCountsByRoute = new Map<string, RouteStopCounts>();
    const path = join(dataDirFor(agencyId), 'stop_times.txt');
    if (existsSync(path)) {
      const parser = createReadStream(path).pipe(parse({ columns: true }));
      for await (const row of parser as AsyncIterable<StopTimeRow>) {
        const trip = tripsById.get(row.trip_id);
        if (!trip || (trip.directionId !== 0 && trip.directionId !== 1)) continue;
        const { routeId, directionId } = trip;
        const set = routeIdsByStop.get(row.stop_id);
        if (set) set.add(routeId);
        else routeIdsByStop.set(row.stop_id, new Set([routeId]));

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

function clearAgencyCaches(agencyId: AgencyId): void {
  staticDataCache.delete(agencyId);
  agencyStopIndexesCache.delete(agencyId);
  for (const key of routeStopTimesCache.keys()) {
    if (key.startsWith(`${agencyId}:`)) routeStopTimesCache.delete(key);
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
  staticDataCache.clear();
  routeStopTimesCache.clear();
  agencyStopIndexesCache.clear();
}
