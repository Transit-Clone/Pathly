import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { parse as parseCsv } from 'csv-parse/sync';
import { unzipSync, zipSync, type Zippable } from 'fflate';

import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { DERIVED_DIR, DERIVED_VERSION } from './gtfsDerived';
import { buildDerivedData } from './gtfsDerivedBuild';

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_ROOT = 'gtfs/v1';
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_DERIVED_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_DERIVED_EXTRACTED_BYTES = 160 * 1024 * 1024;
const MAX_STOP_TIME_ROWS = 1_000_000;
const MAX_STOP_TIMES_PER_TRIP = 500;
const MANIFEST_CHECK_INTERVAL_MS = 5 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 2 * 60_000;
const SNAPSHOT_CHECK_TIMEOUT_MS = 10_000;

const RUNTIME_FILES = [
  'routes.txt',
  'shapes.txt',
  'stops.txt',
  'trips.txt',
  'stop_times.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'feed_info.txt',
] as const;

const RUNTIME_FILE_SET = new Set<string>(RUNTIME_FILES);
const REQUIRED_FILES = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'] as const;
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  'routes.txt': ['route_id'],
  'shapes.txt': ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
  'stops.txt': ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
  'trips.txt': ['trip_id', 'route_id', 'service_id'],
  'stop_times.txt': ['trip_id', 'stop_id', 'arrival_time', 'departure_time', 'stop_sequence'],
  'calendar.txt': ['service_id', 'start_date', 'end_date'],
  'calendar_dates.txt': ['service_id', 'date', 'exception_type'],
  'feed_info.txt': ['feed_publisher_name'],
};

export type GtfsSnapshotFile = {
  name: string;
  sha256: string;
  size: number;
};

/**
 * The prepared timetable files (gtfsDerivedBuild.ts) for one snapshot version, published as a
 * separate archive so the runtime archive, its hash, and the snapshot version never change when
 * prepared output is added or rebuilt in a newer format.
 */
export type GtfsSnapshotDerived = {
  /** DERIVED_VERSION the archive was built with. */
  version: number;
  object: string;
  sha256: string;
  size: number;
};

export type GtfsSnapshotManifest = {
  agencyId: AgencyId;
  archiveObject: string;
  archiveSha256: string;
  archiveSize: number;
  /** Absent for snapshots published before prepared output existed, or when its build failed. */
  derived?: GtfsSnapshotDerived;
  files: GtfsSnapshotFile[];
  previousArchiveObject: string | null;
  publishedAt: string;
  schemaVersion: 1;
  serviceEndDate: string | null;
  sourceLastModified: string | null;
  sourceUrl: string;
  version: string;
};

export type ExtractedGtfsArchive = {
  files: Map<string, Buffer>;
  metadata: GtfsSnapshotFile[];
  serviceEndDate: string | null;
};

export type ExtractGtfsArchiveOptions = {
  /** Runtime hydration can skip this because it verifies hashes from a scheduler-validated manifest. */
  semanticValidation?: boolean;
};

export type HydratedGtfsSnapshot = {
  dataDir: string;
  version: string;
};

type SnapshotState = {
  checkedAtMs: number;
  inFlight?: Promise<HydratedGtfsSnapshot | null>;
  snapshot: HydratedGtfsSnapshot | null;
};

type CurrentManifest = {
  generation: number | string;
  invalidMessage?: string;
  manifest: GtfsSnapshotManifest | null;
};

type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

const snapshotStates = new Map<AgencyId, SnapshotState>();
let storageBucketForTests: StorageBucket | undefined;
let derivedArchiveBuilderForTests: ((agencyId: AgencyId, files: ReadonlyMap<string, Buffer>) => Promise<Buffer>) | undefined;

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function snapshotVersion(files: readonly GtfsSnapshotFile[]): string {
  const versionHash = createHash('sha256');
  for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
    versionHash.update(file.name).update('\0').update(String(file.size)).update('\0').update(file.sha256).update('\n');
  }
  return versionHash.digest('hex');
}

export function derivedArchiveObject(agencyId: AgencyId, version: string, derivedVersion: number): string {
  return `${SNAPSHOT_ROOT}/${agencyId}/derived/${version}-v${derivedVersion}.zip`;
}

function normalizedBasename(name: string): string {
  return basename(name.replaceAll('\\', '/'));
}

function csvRows(data: Buffer): string[][] {
  return parseCsv(data, { bom: true, relax_column_count: true, skip_empty_lines: true }) as string[][];
}

function validateCsv(name: string, data: Buffer): void {
  if (data.length === 0) throw new Error(`${name} is empty`);
  const newline = data.indexOf(10);
  if (newline < 0 || newline === data.length - 1) throw new Error(`${name} has no data rows`);

  const rows = csvRows(data.subarray(0, newline));
  const columns = new Set(rows[0] ?? []);
  for (const required of REQUIRED_COLUMNS[name] ?? []) {
    if (!columns.has(required)) throw new Error(`${name} is missing required column ${required}`);
  }
}

type CsvRecord = Record<string, string>;

function requiredCsvValue(record: CsvRecord, name: string, column: string): string {
  const value = record[column] ?? '';
  if (!value.trim()) throw new Error(`${name} contains a row without ${column}`);
  if (value !== value.trim()) throw new Error(`${name} contains surrounding whitespace in ${column}`);
  return value;
}

function scanCsv(name: string, data: Buffer, visit: (record: CsvRecord) => void): number {
  let count = 0;
  try {
    parseCsv(data, {
      bom: true,
      columns: true,
      on_record: (record: CsvRecord) => {
        count += 1;
        visit(record);
        // csv-parse/sync otherwise retains every row in its result array. Returning null keeps
        // validation bounded while still parsing every record, including the large stop_times.
        return null;
      },
      relax_column_count: true,
      skip_empty_lines: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} failed semantic validation: ${message}`, { cause: error });
  }
  if (count === 0) throw new Error(`${name} has no data rows`);
  return count;
}

function isGtfsDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isGtfsTime(value: string): boolean {
  return /^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value);
}

/** Fully parse the records the backend consumes and reject broken core references. */
function validateGtfsSemantics(files: Map<string, Buffer>): void {
  const routeIds = new Set<string>();
  scanCsv('routes.txt', files.get('routes.txt')!, (record) => {
    const routeId = requiredCsvValue(record, 'routes.txt', 'route_id');
    if (routeIds.has(routeId)) throw new Error(`routes.txt contains duplicate route_id ${routeId}`);
    routeIds.add(routeId);
  });

  const stops = new Map<string, { hasCoordinates: boolean; parentStation: string | null }>();
  scanCsv('stops.txt', files.get('stops.txt')!, (record) => {
    const stopId = requiredCsvValue(record, 'stops.txt', 'stop_id');
    if (stops.has(stopId)) throw new Error(`stops.txt contains duplicate stop_id ${stopId}`);

    const latText = record.stop_lat?.trim() ?? '';
    const lonText = record.stop_lon?.trim() ?? '';
    const hasCoordinates = Boolean(latText || lonText);
    if (hasCoordinates) {
      if (!latText || !lonText) throw new Error(`stops.txt contains incomplete coordinates for stop_id ${stopId}`);
      const lat = Number(latText);
      const lon = Number(lonText);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error(`stops.txt contains invalid coordinates for stop_id ${stopId}`);
      }
    }
    const parentStation = record.parent_station || null;
    if (parentStation && parentStation !== parentStation.trim()) {
      throw new Error(`stops.txt contains surrounding whitespace in parent_station for stop_id ${stopId}`);
    }
    stops.set(stopId, { hasCoordinates, parentStation });
  });
  for (const [stopId, stop] of stops) {
    if (stop.parentStation) {
      const parent = stops.get(stop.parentStation);
      if (!parent) throw new Error(`stops.txt stop_id ${stopId} references unknown parent_station ${stop.parentStation}`);
      if (!parent.hasCoordinates) {
        throw new Error(`stops.txt parent_station ${stop.parentStation} has no coordinates`);
      }
    }
  }

  const serviceIds = new Set<string>();
  const calendarServiceIds = new Set<string>();
  const calendar = files.get('calendar.txt');
  if (calendar) {
    scanCsv('calendar.txt', calendar, (record) => {
      const serviceId = requiredCsvValue(record, 'calendar.txt', 'service_id');
      if (calendarServiceIds.has(serviceId)) {
        throw new Error(`calendar.txt contains duplicate service_id ${serviceId}`);
      }
      calendarServiceIds.add(serviceId);
      serviceIds.add(serviceId);
      const startDate = requiredCsvValue(record, 'calendar.txt', 'start_date');
      const endDate = requiredCsvValue(record, 'calendar.txt', 'end_date');
      if (!isGtfsDate(startDate) || !isGtfsDate(endDate) || endDate < startDate) {
        throw new Error(`calendar.txt contains an invalid date range for service_id ${serviceId}`);
      }
      for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
        if (record[day] !== '0' && record[day] !== '1') {
          throw new Error(`calendar.txt contains an invalid ${day} flag for service_id ${serviceId}`);
        }
      }
    });
  }

  const calendarDates = files.get('calendar_dates.txt');
  const calendarDateKeys = new Set<string>();
  if (calendarDates) {
    scanCsv('calendar_dates.txt', calendarDates, (record) => {
      const serviceId = requiredCsvValue(record, 'calendar_dates.txt', 'service_id');
      serviceIds.add(serviceId);
      const date = requiredCsvValue(record, 'calendar_dates.txt', 'date');
      const key = `${serviceId}\0${date}`;
      if (calendarDateKeys.has(key)) {
        throw new Error(`calendar_dates.txt contains duplicate service_id/date ${serviceId}/${date}`);
      }
      calendarDateKeys.add(key);
      if (!isGtfsDate(date) || (record.exception_type !== '1' && record.exception_type !== '2')) {
        throw new Error(`calendar_dates.txt contains an invalid exception for service_id ${serviceId}`);
      }
    });
  }

  const tripIds = new Set<string>();
  scanCsv('trips.txt', files.get('trips.txt')!, (record) => {
    const tripId = requiredCsvValue(record, 'trips.txt', 'trip_id');
    const routeId = requiredCsvValue(record, 'trips.txt', 'route_id');
    const serviceId = requiredCsvValue(record, 'trips.txt', 'service_id');
    if (tripIds.has(tripId)) throw new Error(`trips.txt contains duplicate trip_id ${tripId}`);
    if (!routeIds.has(routeId)) throw new Error(`trips.txt references unknown route_id ${routeId}`);
    if (!serviceIds.has(serviceId)) throw new Error(`trips.txt references unknown service_id ${serviceId}`);
    if (record.direction_id !== '0' && record.direction_id !== '1') {
      throw new Error(`trips.txt contains invalid direction_id for trip_id ${tripId}`);
    }
    tripIds.add(tripId);
  });

  const stopTimeCounts = new Map<string, number>();
  const stopSequencesByTrip = new Map<string, Set<number>>();
  let stopTimeRowCount = 0;
  scanCsv('stop_times.txt', files.get('stop_times.txt')!, (record) => {
    stopTimeRowCount += 1;
    if (stopTimeRowCount > MAX_STOP_TIME_ROWS) {
      throw new Error(`stop_times.txt exceeds ${MAX_STOP_TIME_ROWS} rows`);
    }
    const tripId = requiredCsvValue(record, 'stop_times.txt', 'trip_id');
    const stopId = requiredCsvValue(record, 'stop_times.txt', 'stop_id');
    if (!tripIds.has(tripId)) throw new Error(`stop_times.txt references unknown trip_id ${tripId}`);
    const stop = stops.get(stopId);
    if (!stop) throw new Error(`stop_times.txt references unknown stop_id ${stopId}`);
    // Runtime distance/geometry code reads the referenced stop's coordinates directly; parent
    // coordinates are not a safe substitute here because Number('') would silently become 0.
    if (!stop.hasCoordinates) throw new Error(`stop_times.txt stop_id ${stopId} has no coordinates`);

    const sequence = Number(requiredCsvValue(record, 'stop_times.txt', 'stop_sequence'));
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new Error(`stop_times.txt contains invalid stop_sequence for trip_id ${tripId}`);
    }
    const sequences = stopSequencesByTrip.get(tripId) ?? new Set<number>();
    if (sequences.has(sequence)) {
      throw new Error(`stop_times.txt contains duplicate stop_sequence ${sequence} for trip_id ${tripId}`);
    }
    if (sequences.size >= MAX_STOP_TIMES_PER_TRIP) {
      throw new Error(`stop_times.txt trip_id ${tripId} exceeds ${MAX_STOP_TIMES_PER_TRIP} stops`);
    }
    sequences.add(sequence);
    stopSequencesByTrip.set(tripId, sequences);
    const arrival = record.arrival_time?.trim() ?? '';
    const departure = record.departure_time?.trim() ?? '';
    if (!arrival && !departure) throw new Error(`stop_times.txt contains an untimed stop for trip_id ${tripId}`);
    if ((arrival && !isGtfsTime(arrival)) || (departure && !isGtfsTime(departure))) {
      throw new Error(`stop_times.txt contains an invalid time for trip_id ${tripId}`);
    }
    stopTimeCounts.set(tripId, (stopTimeCounts.get(tripId) ?? 0) + 1);
  });

  for (const tripId of tripIds) {
    if ((stopTimeCounts.get(tripId) ?? 0) < 2) throw new Error(`trips.txt trip_id ${tripId} has fewer than two stop times`);
  }
}

function maxGtfsDate(values: Iterable<string | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value || !/^\d{8}$/.test(value)) continue;
    if (latest === null || value > latest) latest = value;
  }
  return latest;
}

function serviceEndDate(files: Map<string, Buffer>): string | null {
  const dates: (string | undefined)[] = [];

  const feedInfo = files.get('feed_info.txt');
  if (feedInfo) {
    const [headers = [], ...rows] = csvRows(feedInfo);
    const endIndex = headers.indexOf('feed_end_date');
    if (endIndex >= 0) dates.push(...rows.map((row) => row[endIndex]));
  }

  const calendar = files.get('calendar.txt');
  if (calendar) {
    const [headers = [], ...rows] = csvRows(calendar);
    const endIndex = headers.indexOf('end_date');
    if (endIndex >= 0) dates.push(...rows.map((row) => row[endIndex]));
  }

  const calendarDates = files.get('calendar_dates.txt');
  if (calendarDates) {
    const [headers = [], ...rows] = csvRows(calendarDates);
    const dateIndex = headers.indexOf('date');
    if (dateIndex >= 0) dates.push(...rows.map((row) => row[dateIndex]));
  }

  return maxGtfsDate(dates);
}

type ServicePattern = {
  daysOfWeek: readonly boolean[];
  endDate: string;
  startDate: string;
};

type ServiceSchedule = {
  exceptions: Map<string, Map<string, '1' | '2'>>;
  patterns: Map<string, ServicePattern>;
  referencedServiceIds: Set<string>;
};

function buildServiceSchedule(files: Map<string, Buffer>): ServiceSchedule {
  const patterns = new Map<string, ServicePattern>();
  const calendar = files.get('calendar.txt');
  if (calendar) {
    const [headers = [], ...rows] = csvRows(calendar);
    const position = (column: string): number => headers.indexOf(column);
    for (const row of rows) {
      const serviceId = row[position('service_id')]!;
      patterns.set(serviceId, {
        daysOfWeek: [
          row[position('sunday')],
          row[position('monday')],
          row[position('tuesday')],
          row[position('wednesday')],
          row[position('thursday')],
          row[position('friday')],
          row[position('saturday')],
        ].map((value) => value === '1'),
        endDate: row[position('end_date')]!,
        startDate: row[position('start_date')]!,
      });
    }
  }

  const exceptions = new Map<string, Map<string, '1' | '2'>>();
  const calendarDates = files.get('calendar_dates.txt');
  if (calendarDates) {
    const [headers = [], ...rows] = csvRows(calendarDates);
    const serviceIndex = headers.indexOf('service_id');
    const dateIndex = headers.indexOf('date');
    const typeIndex = headers.indexOf('exception_type');
    for (const row of rows) {
      const serviceId = row[serviceIndex]!;
      const dates = exceptions.get(serviceId) ?? new Map<string, '1' | '2'>();
      dates.set(row[dateIndex]!, row[typeIndex] === '2' ? '2' : '1');
      exceptions.set(serviceId, dates);
    }
  }

  const referencedServiceIds = new Set<string>();
  const trips = files.get('trips.txt')!;
  const [headers = [], ...rows] = csvRows(trips);
  const serviceIndex = headers.indexOf('service_id');
  for (const row of rows) referencedServiceIds.add(row[serviceIndex]!);

  return { exceptions, patterns, referencedServiceIds };
}

function serviceRunsOn(schedule: ServiceSchedule, serviceId: string, value: Date): boolean {
  const key = dateKey(value);
  const exception = schedule.exceptions.get(serviceId)?.get(key);
  if (exception) return exception === '1';
  const pattern = schedule.patterns.get(serviceId);
  if (!pattern || key < pattern.startDate || key > pattern.endDate) return false;
  return pattern.daysOfWeek[value.getUTCDay()] ?? false;
}

function activeServiceIdsInWindow(schedule: ServiceSchedule, now: Date, daysAhead: number): Set<string> {
  const active = new Set<string>();
  const date = dateFromKey(dateKey(now));
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    for (const serviceId of schedule.referencedServiceIds) {
      if (serviceRunsOn(schedule, serviceId, date)) active.add(serviceId);
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return active;
}

function operationalServiceEndDate(files: Map<string, Buffer>): string | null {
  const schedule = buildServiceSchedule(files);
  let latest: string | null = null;

  for (const serviceId of schedule.referencedServiceIds) {
    const pattern = schedule.patterns.get(serviceId);
    if (pattern) {
      const end = dateFromKey(pattern.endDate);
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
        if (!pattern.daysOfWeek[dayOfWeek]) continue;
        const candidate = new Date(end);
        candidate.setUTCDate(candidate.getUTCDate() - ((candidate.getUTCDay() - dayOfWeek + 7) % 7));
        while (dateKey(candidate) >= pattern.startDate) {
          const key = dateKey(candidate);
          if (schedule.exceptions.get(serviceId)?.get(key) !== '2') {
            if (latest === null || key > latest) latest = key;
            break;
          }
          candidate.setUTCDate(candidate.getUTCDate() - 7);
        }
      }
    }

    for (const [key, type] of schedule.exceptions.get(serviceId) ?? []) {
      if (type === '1' && (latest === null || key > latest)) latest = key;
    }
  }

  const feedInfo = files.get('feed_info.txt');
  if (feedInfo) {
    const [headers = [], ...rows] = csvRows(feedInfo);
    const endIndex = headers.indexOf('feed_end_date');
    const declaredEnd = endIndex < 0 ? null : maxGtfsDate(rows.map((row) => row[endIndex]));
    if (declaredEnd && (!latest || declaredEnd < latest)) latest = declaredEnd;
  }

  return latest;
}

function hasActiveServiceInWindow(files: Map<string, Buffer>, now: Date, daysAhead: number): boolean {
  const schedule = buildServiceSchedule(files);
  return activeServiceIdsInWindow(schedule, now, daysAhead).size > 0;
}

/** Keep automatic updates from breaking the route/stop pairs hard-coded as app fallbacks. */
export function validateAgencySnapshotContract(
  agencyId: AgencyId,
  extracted: ExtractedGtfsArchive,
  now = new Date(),
): void {
  const config = AGENCY_CONFIGS[agencyId];
  const requiredRouteIds = new Set(config.requiredStaticFallbacks.map(({ routeId }) => routeId));
  const routeRows = csvRows(extracted.files.get('routes.txt')!);
  const routeIdIndex = routeRows[0]?.indexOf('route_id') ?? -1;
  const routeIds = new Set(routeRows.slice(1).map((row) => row[routeIdIndex]));
  const activeServices = activeServiceIdsInWindow(buildServiceSchedule(extracted.files), now, 1);

  const tripRows = csvRows(extracted.files.get('trips.txt')!);
  const tripIdIndex = tripRows[0]?.indexOf('trip_id') ?? -1;
  const tripRouteIndex = tripRows[0]?.indexOf('route_id') ?? -1;
  const tripServiceIndex = tripRows[0]?.indexOf('service_id') ?? -1;
  const activeRouteByTrip = new Map<string, string>();
  for (const row of tripRows.slice(1)) {
    const routeId = row[tripRouteIndex];
    const serviceId = row[tripServiceIndex];
    if (routeId && serviceId && requiredRouteIds.has(routeId) && activeServices.has(serviceId)) {
      activeRouteByTrip.set(row[tripIdIndex]!, routeId);
    }
  }

  const servedStopsByRoute = new Map<string, Set<string>>();
  scanCsv('stop_times.txt', extracted.files.get('stop_times.txt')!, (record) => {
    const routeId = activeRouteByTrip.get(record.trip_id ?? '');
    const stopId = record.stop_id;
    if (!routeId || !stopId) return;
    const servedStops = servedStopsByRoute.get(routeId) ?? new Set<string>();
    servedStops.add(stopId);
    servedStopsByRoute.set(routeId, servedStops);
  });

  for (const { routeId, stopIds } of config.requiredStaticFallbacks) {
    if (!routeIds.has(routeId)) throw new Error(`${agencyId} GTFS feed is missing required route_id ${routeId}`);
    const servedStops = servedStopsByRoute.get(routeId);
    if (!servedStops) throw new Error(`${agencyId} required route_id ${routeId} has no current trips`);
    for (const stopId of stopIds) {
      if (!servedStops.has(stopId)) {
        throw new Error(`${agencyId} required stop_id ${stopId} is not served by current route_id ${routeId}`);
      }
    }
  }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function dateFromKey(value: string): Date {
  return new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8))));
}

/** Reject feeds with no current service instead of atomically replacing a still-usable snapshot. */
export function daysUntilGtfsServiceEnd(serviceEndDate: string | null, now = new Date()): number {
  if (!serviceEndDate || !isGtfsDate(serviceEndDate)) throw new Error('GTFS feed has no valid service end date');
  const today = dateFromKey(dateKey(now));
  return Math.floor((dateFromKey(serviceEndDate).getTime() - today.getTime()) / 86_400_000);
}

export function assertGtfsServiceIsCurrent(extracted: ExtractedGtfsArchive, now = new Date()): number {
  const daysRemaining = daysUntilGtfsServiceEnd(extracted.serviceEndDate, now);
  if (daysRemaining < 0) throw new Error(`GTFS feed expired on ${extracted.serviceEndDate}`);
  if (!hasActiveServiceInWindow(extracted.files, now, 1)) {
    throw new Error('GTFS feed has no trip-referenced service today or tomorrow');
  }
  return daysRemaining;
}

/** Extract only files the runtime reads and reject incomplete or unexpectedly large feeds. */
export function extractGtfsArchive(
  archive: Uint8Array,
  { semanticValidation = true }: ExtractGtfsArchiveOptions = {},
): ExtractedGtfsArchive {
  if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`GTFS archive size ${archive.byteLength} is outside the allowed range`);
  }

  const selected = new Set<string>();
  let extractedBytes = 0;
  const unzipped = unzipSync(archive, {
    filter: (entry) => {
      const name = normalizedBasename(entry.name);
      if (!RUNTIME_FILE_SET.has(name)) return false;
      if (selected.has(name)) throw new Error(`GTFS archive contains duplicate ${name}`);
      if (entry.originalSize <= 0) throw new Error(`${name} is empty`);
      extractedBytes += entry.originalSize;
      if (extractedBytes > MAX_EXTRACTED_BYTES) throw new Error('GTFS archive expands beyond the allowed size');
      selected.add(name);
      return true;
    },
  });

  const files = new Map<string, Buffer>();
  for (const [entryName, bytes] of Object.entries(unzipped)) {
    const name = normalizedBasename(entryName);
    if (RUNTIME_FILE_SET.has(name)) files.set(name, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }

  for (const name of REQUIRED_FILES) {
    if (!files.has(name)) throw new Error(`GTFS archive is missing ${name}`);
  }
  if (!files.has('calendar.txt') && !files.has('calendar_dates.txt')) {
    throw new Error('GTFS archive must include calendar.txt or calendar_dates.txt');
  }

  for (const [name, data] of files) validateCsv(name, data);
  if (semanticValidation) validateGtfsSemantics(files);
  const metadata = [...files.entries()]
    .map(([name, data]) => ({ name, sha256: sha256(data), size: data.length }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    files,
    metadata,
    serviceEndDate: semanticValidation ? operationalServiceEndDate(files) : serviceEndDate(files),
  };
}

function isAgencyId(value: unknown): value is AgencyId {
  return typeof value === 'string' && Object.hasOwn(AGENCY_CONFIGS, value);
}

function isSnapshotFile(value: unknown): value is GtfsSnapshotFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<GtfsSnapshotFile>;
  return (
    typeof file.name === 'string' &&
    RUNTIME_FILE_SET.has(file.name) &&
    typeof file.size === 'number' &&
    Number.isInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_EXTRACTED_BYTES &&
    typeof file.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(file.sha256)
  );
}

/** Treat the manifest as untrusted input before using any object name or local directory. */
export function parseGtfsSnapshotManifest(value: unknown, expectedAgencyId?: AgencyId): GtfsSnapshotManifest {
  if (!value || typeof value !== 'object') throw new Error('GTFS manifest must be an object');
  const manifest = value as Partial<GtfsSnapshotManifest>;
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error('Unsupported GTFS manifest schema');
  if (!isAgencyId(manifest.agencyId) || (expectedAgencyId && manifest.agencyId !== expectedAgencyId)) {
    throw new Error('GTFS manifest agency does not match');
  }
  if (typeof manifest.version !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.version)) {
    throw new Error('GTFS manifest version is invalid');
  }
  if (typeof manifest.archiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.archiveSha256)) {
    throw new Error('GTFS manifest archive hash is invalid');
  }
  if (typeof manifest.archiveSize !== 'number' || manifest.archiveSize <= 0 || manifest.archiveSize > MAX_ARCHIVE_BYTES) {
    throw new Error('GTFS manifest archive size is invalid');
  }

  const expectedObject = `${SNAPSHOT_ROOT}/${manifest.agencyId}/versions/${manifest.archiveSha256}.zip`;
  if (manifest.archiveObject !== expectedObject) throw new Error('GTFS manifest archive object is invalid');
  if (manifest.previousArchiveObject !== null) {
    const escapedAgencyId = manifest.agencyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const previousPattern = new RegExp(`^${SNAPSHOT_ROOT}/${escapedAgencyId}/versions/[a-f0-9]{64}\\.zip$`);
    if (
      typeof manifest.previousArchiveObject !== 'string' ||
      manifest.previousArchiveObject === manifest.archiveObject ||
      !previousPattern.test(manifest.previousArchiveObject)
    ) {
      throw new Error('GTFS manifest previous archive object is invalid');
    }
  }
  if (typeof manifest.sourceUrl !== 'string' || !manifest.sourceUrl.startsWith('https://')) {
    throw new Error('GTFS manifest source URL is invalid');
  }
  if (typeof manifest.publishedAt !== 'string' || Number.isNaN(Date.parse(manifest.publishedAt))) {
    throw new Error('GTFS manifest publication date is invalid');
  }
  if (manifest.serviceEndDate !== null && (typeof manifest.serviceEndDate !== 'string' || !/^\d{8}$/.test(manifest.serviceEndDate))) {
    throw new Error('GTFS manifest service end date is invalid');
  }
  if (
    manifest.sourceLastModified !== null &&
    (typeof manifest.sourceLastModified !== 'string' || Number.isNaN(Date.parse(manifest.sourceLastModified)))
  ) {
    throw new Error('GTFS manifest source modification date is invalid');
  }
  if (!Array.isArray(manifest.files) || !manifest.files.every(isSnapshotFile)) {
    throw new Error('GTFS manifest file list is invalid');
  }

  const names = new Set(manifest.files.map((file) => file.name));
  if (names.size !== manifest.files.length) throw new Error('GTFS manifest contains duplicate files');
  for (const name of REQUIRED_FILES) {
    if (!names.has(name)) throw new Error(`GTFS manifest is missing ${name}`);
  }
  if (!names.has('calendar.txt') && !names.has('calendar_dates.txt')) {
    throw new Error('GTFS manifest has no service calendar');
  }
  if (manifest.version !== snapshotVersion(manifest.files)) {
    throw new Error('GTFS manifest version does not match its runtime files');
  }
  if (manifest.derived !== undefined) {
    const derived = manifest.derived as Partial<GtfsSnapshotDerived> | null;
    if (
      !derived ||
      typeof derived !== 'object' ||
      !Number.isInteger(derived.version) ||
      derived.version! < 1 ||
      derived.object !== derivedArchiveObject(manifest.agencyId, manifest.version, derived.version!) ||
      typeof derived.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(derived.sha256) ||
      typeof derived.size !== 'number' ||
      derived.size <= 0 ||
      derived.size > MAX_DERIVED_ARCHIVE_BYTES
    ) {
      throw new Error('GTFS manifest prepared-data archive is invalid');
    }
  }

  return manifest as GtfsSnapshotManifest;
}

export function createGtfsSnapshotManifest(
  agencyId: AgencyId,
  sourceUrl: string,
  archive: Uint8Array,
  extracted: ExtractedGtfsArchive,
  publishedAt = new Date(),
  sourceLastModified: string | null = null,
  previousArchiveObject: string | null = null,
): GtfsSnapshotManifest {
  const version = snapshotVersion(extracted.metadata);
  const archiveSha256 = sha256(archive);
  return {
    agencyId,
    archiveObject: `${SNAPSHOT_ROOT}/${agencyId}/versions/${archiveSha256}.zip`,
    archiveSha256,
    archiveSize: archive.byteLength,
    files: extracted.metadata,
    previousArchiveObject,
    publishedAt: publishedAt.toISOString(),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    serviceEndDate: extracted.serviceEndDate,
    sourceLastModified,
    sourceUrl,
    version,
  };
}

function bucket(): StorageBucket {
  if (storageBucketForTests) return storageBucketForTests;
  const app = getApps()[0] ?? initializeApp();
  return getStorage(app).bucket();
}

function currentManifestObject(agencyId: AgencyId): string {
  return `${SNAPSHOT_ROOT}/${agencyId}/current.json`;
}

function isNotFound(error: unknown): boolean {
  const code = (error as { code?: number | string } | null)?.code;
  return code === 404 || code === '404';
}

function isPreconditionFailed(error: unknown): boolean {
  const code = (error as { code?: number | string } | null)?.code;
  return code === 412 || code === '412';
}

function boundedStoredObjectSize(value: unknown, maximum: number, label: string): number {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) {
    throw new Error(`${label} size is outside the allowed range`);
  }
  return size;
}

async function readCurrentManifest(agencyId: AgencyId): Promise<CurrentManifest> {
  const storage = bucket();
  const object = currentManifestObject(agencyId);

  // Pin the download to the generation whose metadata we read. Without this, an overwrite
  // between getMetadata() and download() could pair stale JSON with a newer generation and
  // defeat the compare-and-swap used when publishing below.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [metadata] = await storage.file(object).getMetadata();
      if (metadata.generation === undefined) throw new Error('GTFS manifest has no storage generation');
      const generation = metadata.generation;
      const declaredSize = Number(metadata.size);
      if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_MANIFEST_BYTES) {
        return {
          generation,
          invalidMessage: 'GTFS manifest size is outside the allowed range',
          manifest: null,
        };
      }
      const [data] = await storage.file(object, { generation }).download();
      if (data.length !== declaredSize) {
        return {
          generation,
          invalidMessage: 'GTFS manifest size changed during download',
          manifest: null,
        };
      }
      try {
        return {
          generation,
          manifest: parseGtfsSnapshotManifest(JSON.parse(data.toString('utf8')) as unknown, agencyId),
        };
      } catch (error) {
        return {
          generation,
          invalidMessage: error instanceof Error ? error.message : String(error),
          manifest: null,
        };
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
      if (attempt === 0) continue;
    }
  }

  return { generation: 0, manifest: null };
}

async function downloadArchive(
  sourceUrl: string,
): Promise<{ archive: Buffer; sourceLastModified: string | null }> {
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Pathly-GTFS-Refresh/1.0' },
    // Sources are version-controlled HTTPS URLs. Refuse redirects so a compromised upstream
    // cannot turn the scheduled server-side fetch into a request to an internal endpoint.
    redirect: 'error',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GTFS source returned HTTP ${response.status}`);

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_ARCHIVE_BYTES) {
    throw new Error(`GTFS source declared ${declaredSize} bytes, above the allowed size`);
  }
  if (!response.body) throw new Error('GTFS source returned no body');

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ARCHIVE_BYTES) {
      await reader.cancel();
      throw new Error('GTFS source exceeded the allowed download size');
    }
    chunks.push(Buffer.from(value));
  }
  const lastModified = response.headers.get('last-modified');
  const sourceLastModified = lastModified && !Number.isNaN(Date.parse(lastModified))
    ? new Date(lastModified).toISOString()
    : null;
  return { archive: Buffer.concat(chunks, total), sourceLastModified };
}

async function ensureSnapshotArchive(
  storage: ReturnType<typeof bucket>,
  manifest: GtfsSnapshotManifest,
  archive: Buffer,
): Promise<void> {
  const save = (ifGenerationMatch: number | string) =>
    storage.file(manifest.archiveObject).save(archive, {
      metadata: { cacheControl: 'private, max-age=31536000, immutable', contentType: 'application/zip' },
      preconditionOpts: { ifGenerationMatch },
      resumable: archive.length >= 5 * 1024 * 1024,
      validation: 'crc32c',
    });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await save(0);
      return;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }

    try {
      const [metadata] = await storage.file(manifest.archiveObject).getMetadata();
      if (metadata.generation === undefined) throw new Error('GTFS archive has no storage generation');
      const generation = metadata.generation;
      const declaredSize = Number(metadata.size);
      const canDownload = Number.isSafeInteger(declaredSize) && declaredSize > 0 && declaredSize <= MAX_ARCHIVE_BYTES;
      if (canDownload && declaredSize === manifest.archiveSize) {
        const [existing] = await storage.file(manifest.archiveObject, { generation }).download();
        if (existing.length === declaredSize && sha256(existing) === manifest.archiveSha256) return;
      }

      logger.error('Repairing corrupt immutable GTFS archive', {
        agencyId: manifest.agencyId,
        event: 'gtfs_snapshot_archive_repair',
        version: manifest.version,
      });
      try {
        await save(generation);
        return;
      } catch (error) {
        if (!isPreconditionFailed(error)) throw error;
      }
    } catch (error) {
      if (!isNotFound(error) || attempt > 0) throw error;
    }
  }

  throw new Error('GTFS archive changed repeatedly while it was being verified');
}

async function snapshotArchiveMatches(
  storage: ReturnType<typeof bucket>,
  manifest: GtfsSnapshotManifest,
): Promise<boolean> {
  try {
    const [metadata] = await storage.file(manifest.archiveObject).getMetadata();
    if (metadata.generation === undefined) return false;
    const declaredSize = Number(metadata.size);
    if (
      !Number.isSafeInteger(declaredSize) ||
      declaredSize !== manifest.archiveSize ||
      declaredSize <= 0 ||
      declaredSize > MAX_ARCHIVE_BYTES
    ) {
      return false;
    }
    const [existing] = await storage.file(manifest.archiveObject, { generation: metadata.generation }).download();
    return existing.length === declaredSize && sha256(existing) === manifest.archiveSha256;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

// Fixed entry times make the prepared archive's bytes depend only on its contents, so a rebuild
// of the same snapshot can be recognised as the archive another run already published.
const DERIVED_ZIP_MTIME = new Date('2000-01-01T00:00:00Z');

async function zipDirectory(dir: string): Promise<Buffer> {
  const entries: Zippable = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const name = relative(dir, path).split(sep).join('/');
    entries[name] = new Uint8Array(await readFile(path));
  }
  const sorted: Zippable = {};
  for (const name of Object.keys(entries).sort()) sorted[name] = entries[name]!;
  return Buffer.from(zipSync(sorted, { level: 6, mtime: DERIVED_ZIP_MTIME }));
}

/** Runs the deploy-time builder (gtfsDerivedBuild.ts) on a snapshot's files and zips its output. */
async function buildDerivedArchive(agencyId: AgencyId, files: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const stagingDir = join(tmpdir(), 'pathly-gtfs-build', `${agencyId}-${randomUUID()}`);
  const feedDir = join(stagingDir, 'feed');
  const derivedDir = join(stagingDir, 'derived');
  try {
    await mkdir(feedDir, { recursive: true });
    await Promise.all([...files].map(([name, data]) => writeFile(join(feedDir, name), data)));
    await buildDerivedData(agencyId, feedDir, derivedDir);
    return await zipDirectory(derivedDir);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

/**
 * Uploads a snapshot version's prepared archive. Its object name is fixed by the snapshot and
 * format versions, so an archive another run already published for them is kept (and described
 * as-is) rather than replaced underneath instances that may be reading it.
 */
async function publishDerivedArchive(
  storage: ReturnType<typeof bucket>,
  agencyId: AgencyId,
  version: string,
  archive: Buffer,
): Promise<GtfsSnapshotDerived> {
  const object = derivedArchiveObject(agencyId, version, DERIVED_VERSION);
  if (archive.length > MAX_DERIVED_ARCHIVE_BYTES) throw new Error('Prepared GTFS archive exceeds the allowed size');
  const save = (ifGenerationMatch: number | string) =>
    storage.file(object).save(archive, {
      metadata: { cacheControl: 'private, max-age=31536000, immutable', contentType: 'application/zip' },
      preconditionOpts: { ifGenerationMatch },
      resumable: archive.length >= 5 * 1024 * 1024,
      validation: 'crc32c',
    });
  const described = (data: Buffer): GtfsSnapshotDerived => ({ version: DERIVED_VERSION, object, sha256: sha256(data), size: data.length });

  try {
    await save(0);
    return described(archive);
  } catch (error) {
    if (!isPreconditionFailed(error)) throw error;
  }
  const [metadata] = await storage.file(object).getMetadata();
  if (metadata.generation === undefined) throw new Error('Prepared GTFS archive has no storage generation');
  const size = Number(metadata.size);
  if (Number.isSafeInteger(size) && size > 0 && size <= MAX_DERIVED_ARCHIVE_BYTES) {
    const [existing] = await storage.file(object, { generation: metadata.generation }).download();
    if (existing.length === size) return described(existing);
  }
  await save(metadata.generation);
  return described(archive);
}

/**
 * Builds and publishes a snapshot's prepared archive. Never fails the refresh: without it,
 * instances read the snapshot's raw files (slower, same results).
 */
async function tryPublishDerived(
  storage: ReturnType<typeof bucket>,
  agencyId: AgencyId,
  version: string,
  files: ReadonlyMap<string, Buffer>,
): Promise<GtfsSnapshotDerived | undefined> {
  try {
    const build = derivedArchiveBuilderForTests ?? buildDerivedArchive;
    return await publishDerivedArchive(storage, agencyId, version, await build(agencyId, files));
  } catch (error) {
    logger.error('Could not prepare GTFS snapshot timetable indexes', {
      agencyId,
      event: 'gtfs_snapshot_derived_failed',
      reason: error instanceof Error ? error.message : String(error),
      version,
    });
    return undefined;
  }
}

export async function refreshGtfsSnapshot(agencyId: AgencyId): Promise<'published' | 'unchanged'> {
  const config = AGENCY_CONFIGS[agencyId];
  // Capture the publication generation before the network fetch. A slower invocation that
  // started against an older pointer must not be allowed to overwrite a newer run that wins
  // while this one is still downloading or validating its source feed.
  const current = await readCurrentManifest(agencyId);
  const { archive, sourceLastModified } = await downloadArchive(config.staticFeedUrl);
  const extracted = extractGtfsArchive(archive);
  validateAgencySnapshotContract(agencyId, extracted);
  const daysOfServiceRemaining = assertGtfsServiceIsCurrent(extracted);
  if (daysOfServiceRemaining <= 14) {
    logger.warn('GTFS source feed is nearing the end of published service', {
      agencyId,
      daysOfServiceRemaining,
      event: 'gtfs_service_expiring',
      serviceEndDate: extracted.serviceEndDate,
    });
  }
  const manifest = createGtfsSnapshotManifest(
    agencyId,
    config.staticFeedUrl,
    archive,
    extracted,
    new Date(),
    sourceLastModified,
    null,
  );
  const contentUnchanged = current.manifest?.version === manifest.version;
  manifest.previousArchiveObject = contentUnchanged
    ? current.manifest?.previousArchiveObject ?? null
    : current.manifest?.archiveObject ?? null;
  if (current.manifest?.sourceLastModified && !manifest.sourceLastModified) {
    throw new Error('GTFS source omitted Last-Modified after previously providing it');
  }
  if (current.manifest?.sourceLastModified && manifest.sourceLastModified) {
    const previousModifiedAt = Date.parse(current.manifest.sourceLastModified);
    const nextModifiedAt = Date.parse(manifest.sourceLastModified);
    if (nextModifiedAt < previousModifiedAt) {
      throw new Error(
        `GTFS source Last-Modified moved backward from ${current.manifest.sourceLastModified} to ${manifest.sourceLastModified}`,
      );
    }
    if (nextModifiedAt === previousModifiedAt && manifest.version !== current.manifest.version) {
      throw new Error('GTFS source changed content without advancing Last-Modified');
    }
  }
  if (current.invalidMessage) {
    logger.warn('Replacing invalid GTFS manifest', {
      agencyId,
      event: 'gtfs_snapshot_manifest_repair',
      reason: current.invalidMessage,
    });
  }
  const storage = bucket();
  if (contentUnchanged) {
    // A source can repackage the same runtime CSVs with different ZIP metadata or ignored
    // files. Keep the already-published archive so warm instances do not rehydrate/reindex.
    let archiveChanged = false;
    let refreshedManifest: GtfsSnapshotManifest = current.manifest!;
    // Snapshots published before prepared output existed (or in an older format) gain it here,
    // without a new snapshot version, since the freshly downloaded feed has identical content.
    const backfilledDerived = current.manifest!.derived?.version === DERIVED_VERSION
      ? undefined
      : await tryPublishDerived(storage, agencyId, manifest.version, extracted.files);
    if (backfilledDerived) refreshedManifest = { ...refreshedManifest, derived: backfilledDerived };
    if (!(await snapshotArchiveMatches(storage, current.manifest!))) {
      await ensureSnapshotArchive(storage, manifest, archive);
      archiveChanged = current.manifest!.archiveObject !== manifest.archiveObject;
      refreshedManifest = {
        ...refreshedManifest,
        archiveObject: manifest.archiveObject,
        archiveSha256: manifest.archiveSha256,
        archiveSize: manifest.archiveSize,
      };
    }
    if (!archiveChanged && !backfilledDerived && current.manifest!.sourceLastModified === manifest.sourceLastModified) {
      logger.info('GTFS snapshot is unchanged', { agencyId, event: 'gtfs_snapshot_unchanged', version: manifest.version });
      return 'unchanged';
    }

    refreshedManifest = {
      ...refreshedManifest,
      publishedAt: manifest.publishedAt,
      sourceLastModified: manifest.sourceLastModified,
    };
    try {
      await storage.file(currentManifestObject(agencyId)).save(JSON.stringify(refreshedManifest), {
        metadata: { cacheControl: 'no-store', contentType: 'application/json' },
        preconditionOpts: { ifGenerationMatch: current.generation },
        resumable: false,
        validation: 'crc32c',
      });
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
      const latest = await readCurrentManifest(agencyId);
      if (latest.manifest?.version === manifest.version) {
        return 'unchanged';
      }
      throw new Error('GTFS manifest changed while its source watermark was being refreshed', { cause: error });
    }
    if (backfilledDerived) {
      logger.info('Added prepared timetable indexes to GTFS snapshot', {
        agencyId,
        derivedVersion: backfilledDerived.version,
        event: 'gtfs_snapshot_derived_backfilled',
        version: manifest.version,
      });
    }
    logger.info('GTFS snapshot is unchanged', { agencyId, event: 'gtfs_snapshot_unchanged', version: manifest.version });
    return 'unchanged';
  }

  await ensureSnapshotArchive(storage, manifest, archive);
  const derived = await tryPublishDerived(storage, agencyId, manifest.version, extracted.files);
  if (derived) manifest.derived = derived;

  try {
    // Publishing the small manifest last makes the version switch atomic for every reader.
    // The generation precondition also prevents an overlapping, slower invocation from
    // replacing a manifest that a newer invocation has already published.
    await storage.file(currentManifestObject(agencyId)).save(JSON.stringify(manifest), {
      metadata: { cacheControl: 'no-store', contentType: 'application/json' },
      preconditionOpts: { ifGenerationMatch: current.generation },
      resumable: false,
      validation: 'crc32c',
    });
  } catch (error) {
    if (!isPreconditionFailed(error)) throw error;
    const latest = await readCurrentManifest(agencyId);
    if (latest.manifest?.version === manifest.version) {
      return 'unchanged';
    }
    throw new Error('GTFS manifest changed during publication; retrying with a fresh source feed', { cause: error });
  }

  logger.info('Published GTFS snapshot', {
    agencyId,
    archiveBytes: manifest.archiveSize,
    event: 'gtfs_snapshot_published',
    fileCount: manifest.files.length,
    serviceEndDate: manifest.serviceEndDate,
    version: manifest.version,
  });
  return 'published';
}

function lastRefreshObject(agencyId: AgencyId): string {
  return `${SNAPSHOT_ROOT}/${agencyId}/last-refresh.json`;
}

/** The outcome of an agency's most recent scheduled refresh, for the admin status page. */
export type GtfsRefreshOutcome = { at: string; ok: boolean; result?: 'published' | 'unchanged'; message?: string };

/** Best effort: a status write must never fail the refresh it describes. */
async function recordRefreshOutcome(agencyId: AgencyId, outcome: GtfsRefreshOutcome): Promise<void> {
  try {
    await bucket().file(lastRefreshObject(agencyId)).save(JSON.stringify(outcome), { contentType: 'application/json', resumable: false });
  } catch (error) {
    logger.warn('Could not record GTFS refresh outcome', { agencyId, reason: error instanceof Error ? error.message : String(error) });
  }
}

export async function readLastRefreshOutcome(agencyId: AgencyId): Promise<GtfsRefreshOutcome | null> {
  try {
    const [data] = await bucket().file(lastRefreshObject(agencyId)).download();
    const parsed = JSON.parse(data.toString('utf8')) as Partial<GtfsRefreshOutcome>;
    if (typeof parsed.at !== 'string' || typeof parsed.ok !== 'boolean') return null;
    return {
      at: parsed.at,
      ok: parsed.ok,
      ...(parsed.result === 'published' || parsed.result === 'unchanged' ? { result: parsed.result } : {}),
      ...(typeof parsed.message === 'string' ? { message: parsed.message.slice(0, 300) } : {}),
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The published snapshot's identity and age, or why there is none (admin status page). */
export type GtfsSnapshotSummary =
  | { state: 'published'; version: string; publishedAt: string; serviceEndDate: string | null; hasDerived: boolean }
  | { state: 'missing' }
  | { state: 'invalid'; message: string };

export async function readSnapshotSummary(agencyId: AgencyId): Promise<GtfsSnapshotSummary> {
  const current = await readCurrentManifest(agencyId);
  if (current.manifest) {
    const { version, publishedAt, serviceEndDate, derived } = current.manifest;
    return { state: 'published', version, publishedAt, serviceEndDate, hasDerived: Boolean(derived) };
  }
  return current.invalidMessage ? { state: 'invalid', message: current.invalidMessage } : { state: 'missing' };
}

export async function refreshAllGtfsSnapshots(): Promise<void> {
  const failures: { agencyId: AgencyId; message: string }[] = [];
  for (const agencyId of Object.keys(AGENCY_CONFIGS) as AgencyId[]) {
    try {
      const result = await refreshGtfsSnapshot(agencyId);
      await recordRefreshOutcome(agencyId, { at: new Date().toISOString(), ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ agencyId, message });
      logger.error('GTFS snapshot refresh failed', { agencyId, event: 'gtfs_refresh_failed', reason: message });
      await recordRefreshOutcome(agencyId, { at: new Date().toISOString(), ok: false, message });
    }
  }

  if (failures.length > 0) {
    throw new Error(`GTFS refresh failed for ${failures.map(({ agencyId }) => agencyId).join(', ')}`);
  }
  logger.info('Completed GTFS snapshot refresh', {
    agencyCount: Object.keys(AGENCY_CONFIGS).length,
    event: 'gtfs_refresh_completed',
  });
}

function remoteSnapshotsEnabled(): boolean {
  const override = process.env.GTFS_USE_CLOUD_STORAGE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return Boolean(process.env.K_SERVICE);
}

function assertExtractedMatchesManifest(extracted: ExtractedGtfsArchive, manifest: GtfsSnapshotManifest): void {
  const actual = new Map(extracted.metadata.map((file) => [file.name, file]));
  if (actual.size !== manifest.files.length) throw new Error('GTFS snapshot file count does not match its manifest');
  for (const expected of manifest.files) {
    const file = actual.get(expected.name);
    if (!file || file.size !== expected.size || file.sha256 !== expected.sha256) {
      throw new Error(`GTFS snapshot file ${expected.name} does not match its manifest`);
    }
  }
}

// A prepared archive holds only these files; anything else (or any nested path) is rejected.
const DERIVED_ENTRY_PATTERN = /^(?:manifest\.json|stop-indexes\.json|(?:stop_times|geometry)\/[^/\\]+\.json)$/;

/**
 * The snapshot's prepared files, verified against its manifest, or undefined (logged) when they
 * can't be used — hydration then writes the raw files and the loaders scan them as before.
 */
async function tryLoadDerivedFiles(
  storage: ReturnType<typeof bucket>,
  manifest: GtfsSnapshotManifest,
): Promise<Map<string, Uint8Array> | undefined> {
  const derived = manifest.derived!;
  try {
    const [metadata] = await storage.file(derived.object).getMetadata();
    if (metadata.generation === undefined) throw new Error('prepared archive has no storage generation');
    const declaredSize = boundedStoredObjectSize(metadata.size, MAX_DERIVED_ARCHIVE_BYTES, 'Prepared GTFS archive');
    if (declaredSize !== derived.size) throw new Error('prepared archive size does not match its manifest');
    const [archive] = await storage.file(derived.object, { generation: metadata.generation }).download();
    if (archive.length !== declaredSize || sha256(archive) !== derived.sha256) {
      throw new Error('prepared archive does not match its manifest');
    }

    let extractedBytes = 0;
    const entries = unzipSync(new Uint8Array(archive), {
      filter: (file) => {
        if (!DERIVED_ENTRY_PATTERN.test(file.name)) throw new Error(`unexpected prepared archive entry ${file.name}`);
        extractedBytes += file.originalSize;
        if (extractedBytes > MAX_DERIVED_EXTRACTED_BYTES) throw new Error('prepared archive expands beyond the allowed size');
        return true;
      },
    });
    if (!entries['manifest.json'] || !entries['stop-indexes.json']) throw new Error('prepared archive is incomplete');
    return new Map(Object.entries(entries));
  } catch (error) {
    logger.warn('Using raw GTFS files because prepared timetable indexes are unavailable', {
      agencyId: manifest.agencyId,
      event: 'gtfs_snapshot_derived_unavailable',
      reason: error instanceof Error ? error.message : String(error),
      version: manifest.version,
    });
    return undefined;
  }
}

/**
 * Moves a staged snapshot directory into its content-addressed place. Windows reports an
 * existing target as EPERM rather than ENOTEMPTY, and can briefly lock just-written folders
 * (antivirus, search indexer), so a locked rename onto a missing target is retried.
 */
async function renameIntoPlace(stagingDir: string, dataDir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(stagingDir, dataDir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      // Another hydration in this instance won the race for the same content-addressed path.
      if (code === 'EEXIST' || code === 'ENOTEMPTY') return;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
      if (existsSync(dataDir)) return;
      if (attempt >= 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

async function hydrateManifest(manifest: GtfsSnapshotManifest): Promise<HydratedGtfsSnapshot> {
  const storage = bucket();
  const [metadata] = await storage.file(manifest.archiveObject).getMetadata();
  if (metadata.generation === undefined) throw new Error('GTFS snapshot archive has no storage generation');
  const declaredSize = boundedStoredObjectSize(metadata.size, MAX_ARCHIVE_BYTES, 'GTFS snapshot archive');
  if (declaredSize !== manifest.archiveSize) throw new Error('GTFS snapshot archive size does not match its manifest');
  const [archive] = await storage.file(manifest.archiveObject, { generation: metadata.generation }).download();
  if (archive.length !== declaredSize || sha256(archive) !== manifest.archiveSha256) {
    throw new Error('GTFS snapshot archive does not match its manifest');
  }

  // The scheduler already fully parsed this exact content hash before publishing it. Runtime
  // hydration repeats structural checks and hash verification without re-parsing hundreds of
  // thousands of stop-time records on a cold request.
  const extracted = extractGtfsArchive(archive, { semanticValidation: false });
  assertExtractedMatchesManifest(extracted, manifest);
  const derivedFiles = manifest.derived?.version === DERIVED_VERSION ? await tryLoadDerivedFiles(storage, manifest) : undefined;
  const agencyDir = join(tmpdir(), 'pathly-gtfs', manifest.agencyId);
  const dataDir = join(agencyDir, manifest.version);
  const stagingDir = join(agencyDir, `.${manifest.version}.${randomUUID()}.tmp`);
  await mkdir(stagingDir, { recursive: true });
  try {
    // With prepared files, leave the raw stop times out (as a deploy does): the loaders then read
    // only the prepared files, and /tmp (held in memory) stays about the size it was before.
    const rawFiles = [...extracted.files].filter(([name]) => !derivedFiles || name !== 'stop_times.txt');
    await Promise.all(rawFiles.map(([name, data]) => writeFile(join(stagingDir, name), data)));
    if (derivedFiles) {
      for (const dir of new Set([...derivedFiles.keys()].map((name) => dirname(join(stagingDir, DERIVED_DIR, name))))) {
        await mkdir(dir, { recursive: true });
      }
      await Promise.all([...derivedFiles].map(([name, data]) => writeFile(join(stagingDir, DERIVED_DIR, name), data)));
    }
    await renameIntoPlace(stagingDir, dataDir);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
  logger.info('Hydrated GTFS snapshot', {
    agencyId: manifest.agencyId,
    event: 'gtfs_snapshot_hydrated',
    prepared: derivedFiles !== undefined,
    version: manifest.version,
  });
  return { dataDir, version: manifest.version };
}

async function checkForSnapshot(
  agencyId: AgencyId,
  existing: HydratedGtfsSnapshot | null,
): Promise<HydratedGtfsSnapshot | null> {
  const { invalidMessage, manifest } = await readCurrentManifest(agencyId);
  if (invalidMessage) throw new Error(`GTFS manifest is invalid: ${invalidMessage}`);
  if (!manifest) return existing;
  if (existing?.version === manifest.version) return existing;
  return hydrateManifest(manifest);
}

/**
 * Resolve the current durable snapshot into this callable instance's /tmp cache. Any storage,
 * manifest, or download failure keeps the last good snapshot (or the deploy-bundled fallback).
 */
export async function hydrateCurrentGtfsSnapshot(
  agencyId: AgencyId,
  nowMs = Date.now(),
  snapshotCheckTimeoutMs = SNAPSHOT_CHECK_TIMEOUT_MS,
): Promise<HydratedGtfsSnapshot | null> {
  if (!remoteSnapshotsEnabled()) return null;

  const previous = snapshotStates.get(agencyId) ?? { checkedAtMs: 0, snapshot: null };
  if (previous.inFlight) return previous.inFlight;
  if (nowMs - previous.checkedAtMs < MANIFEST_CHECK_INTERVAL_MS) return previous.snapshot;

  // Share the handled promise, not the raw storage operation. Every concurrent caller must
  // resolve to the same last-good/bundled fallback when Storage fails.
  // The Storage client can otherwise retry a stalled read for up to ten minutes, beyond the
  // callable deadline. Bound the complete manifest/archive check so callers reach the last-good
  // or bundled fallback while there is still time to serve the request.
  const inFlight = withTimeout(
    checkForSnapshot(agencyId, previous.snapshot),
    snapshotCheckTimeoutMs,
    `GTFS snapshot check timed out after ${snapshotCheckTimeoutMs}ms`,
  ).then(
    (snapshot) => {
      snapshotStates.set(agencyId, { checkedAtMs: nowMs, snapshot });
      return snapshot;
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Using last known or bundled GTFS data after snapshot check failed', {
        agencyId,
        event: 'gtfs_snapshot_fallback',
        reason: message,
      });
      snapshotStates.set(agencyId, { checkedAtMs: nowMs, snapshot: previous.snapshot });
      return previous.snapshot;
    },
  );
  snapshotStates.set(agencyId, { ...previous, inFlight });
  return inFlight;
}

/** Unit-test isolation only. */
export function resetGtfsSnapshotStateForTests(): void {
  snapshotStates.clear();
  storageBucketForTests = undefined;
  derivedArchiveBuilderForTests = undefined;
}

/** Unit-test dependency injection only. */
export function setGtfsSnapshotBucketForTests(value: StorageBucket): void {
  storageBucketForTests = value;
}

/** Unit-test dependency injection only. */
export function setGtfsDerivedArchiveBuilderForTests(value: typeof derivedArchiveBuilderForTests): void {
  derivedArchiveBuilderForTests = value;
}
