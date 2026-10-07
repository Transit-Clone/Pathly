import { existsSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Layout of the prepared timetable files that scripts/build-gtfs-index.js writes under each
 * agency's static_data directory, shared with the loaders in gtfsStaticData.ts.
 */
export const DERIVED_DIR = 'derived';
export const STOP_INDEXES_FILE = 'stop-indexes.json';
export const STOP_TIMES_DIR = 'stop_times';
export const MANIFEST_FILE = 'manifest.json';
/** Bumped whenever the file format changes, so older output is treated as stale. */
export const DERIVED_VERSION = 2;

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

/** A route's stop-times file name; route ids are percent-encoded so any id is a safe file name. */
export function routeFileName(routeId: string): string {
  return `${encodeURIComponent(routeId)}.json`;
}
