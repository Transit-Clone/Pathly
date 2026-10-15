import { existsSync, statSync } from 'fs';
import { join } from 'path';

import type { GtfsStopTime } from './gtfsFeed';
import type { RouteGeometry } from './gtfsGeometry';

/**
 * Layout of the prepared timetable files that gtfsDerivedBuild.ts writes under each agency's
 * static_data directory (and into each published snapshot), shared with the loaders in
 * gtfsStaticData.ts.
 */
export const DERIVED_DIR = 'derived';
export const STOP_INDEXES_FILE = 'stop-indexes.json';
export const STOP_TIMES_DIR = 'stop_times';
export const GEOMETRY_DIR = 'geometry';
export const MANIFEST_FILE = 'manifest.json';
/**
 * Bumped whenever the file format changes, so older output is treated as stale. A bump makes every
 * instance ignore the published prepared files (raw GTFS instead: far slower, and the city bus
 * feeds outgrow the callables' memory) until the refresh job rebuilds them, so content-only fixes
 * are applied when the files are read instead (e.g. transitNames.ts in loadPreparedRouteGeometry).
 */
export const DERIVED_VERSION = 3;

/**
 * The agency-wide stop indexes, as ordered pairs (in the order a full scan first meets them):
 * which routes call at each stop, and per route and GTFS direction how many trips call at each
 * stop.
 */
export type DerivedStopIndexes = {
  routeIdsByStop: [stopId: string, routeIds: string[]][];
  stopCountsByRoute: [routeId: string, byDirection: [[stopId: string, trips: number][], [stopId: string, trips: number][]]][];
};

/** The feed files the prepared output depends on (trips.txt maps each trip to its route). */
const SOURCE_FILES = ['stop_times.txt', 'trips.txt'] as const;

export type DerivedSources = Record<(typeof SOURCE_FILES)[number], { size: number; mtimeMs: number } | null>;
export type DerivedManifest = { version: number; sources: DerivedSources };

/** Size and modification time of each source file, or null for one that isn't there. */
export function derivedSources(dataDir: string): DerivedSources {
  const sources = {} as DerivedSources;
  for (const file of SOURCE_FILES) {
    const path = join(dataDir, file);
    if (!existsSync(path)) {
      sources[file] = null;
      continue;
    }
    const stats = statSync(path);
    sources[file] = { size: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) };
  }
  return sources;
}

/** A route's stop-times or geometry file name; route ids are percent-encoded so any id is a safe file name. */
export function routeFileName(routeId: string): string {
  return `${encodeURIComponent(routeId)}.json`;
}

/** A route's prepared geometry file: both directions, null where the direction has no trips. */
export type DerivedRouteGeometry = { 0: RouteGeometry | null; 1: RouteGeometry | null };

export type RouteStopTimes = { byStop: Map<string, GtfsStopTime[]>; byTrip: Map<string, GtfsStopTime[]> };

/** One prepared stop_times row: [tripId, stopId, arrivalTime, departureTime, stopSequence]. */
export type DerivedStopTimeRow = [string, string, string, string, number];

/** A route's prepared rows, indexed the same way (and in the same order) as the CSV scan. */
export function indexStopTimeRows(rows: readonly DerivedStopTimeRow[]): RouteStopTimes {
  const byStop = new Map<string, GtfsStopTime[]>();
  const byTrip = new Map<string, GtfsStopTime[]>();
  for (const [tripId, stopId, arrivalTime, departureTime, stopSequence] of rows) {
    const entry: GtfsStopTime = { tripId, stopId, arrivalTime, departureTime, stopSequence };
    const stopList = byStop.get(stopId);
    if (stopList) stopList.push(entry);
    else byStop.set(stopId, [entry]);
    const tripList = byTrip.get(tripId);
    if (tripList) tripList.push(entry);
    else byTrip.set(tripId, [entry]);
  }
  return { byStop, byTrip };
}
