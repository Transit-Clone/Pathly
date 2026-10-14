import { parse } from 'csv-parse';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { agencyConfig, type AgencyId } from './gtfsAgencies';
import {
  GEOMETRY_DIR,
  DERIVED_VERSION,
  MANIFEST_FILE,
  STOP_INDEXES_FILE,
  STOP_TIMES_DIR,
  derivedSources,
  indexStopTimeRows,
  routeFileName,
  type DerivedRouteGeometry,
  type DerivedStopIndexes,
  type DerivedStopTimeRow,
} from './gtfsDerived';
import { readAgencyStaticData, readShapes, type ShapePoint, type StopTimeRow } from './gtfsFeed';
import { computeRouteGeometry } from './gtfsGeometry';

/**
 * Prepares one agency's timetable for fast cold starts: reads stop_times.txt in `dataDir` once
 * and writes into `outDir` (which the caller creates and swaps into place):
 *   - stop-indexes.json         which routes call at each stop, and per route + direction how
 *                               many trips call at each stop (ordered pairs, in feed order)
 *   - stop_times/<route>.json   { rows: [tripId, stopId, arrival, departure, sequence][] }
 *   - geometry/<route>.json     { 0, 1 }: each direction's computeRouteGeometry result
 *   - manifest.json             the source files (size + mtime) the output was built from
 * Used by scripts/build-gtfs-index.js for deploys and by the daily snapshot refresh.
 */
export async function buildDerivedData(agencyId: AgencyId, dataDir: string, outDir: string): Promise<{ routes: number; stops: number }> {
  const staticData = readAgencyStaticData(dataDir);
  const { tripsById } = staticData;

  const stopRoutes = new Map<string, Set<string>>();
  const stopCountsByRoute = new Map<string, [Map<string, number>, Map<string, number>]>();
  const rowsByRoute = new Map<string, DerivedStopTimeRow[]>();
  const stopTimesPath = join(dataDir, 'stop_times.txt');
  if (existsSync(stopTimesPath)) {
    const parser = createReadStream(stopTimesPath).pipe(parse({ columns: true }));
    for await (const row of parser as AsyncIterable<StopTimeRow>) {
      const trip = tripsById.get(row.trip_id);
      if (!trip) continue;
      const { routeId, directionId } = trip;
      const routes = stopRoutes.get(row.stop_id);
      if (routes) routes.add(routeId);
      else stopRoutes.set(row.stop_id, new Set([routeId]));
      const rows = rowsByRoute.get(routeId);
      const entry: DerivedStopTimeRow = [row.trip_id, row.stop_id, row.arrival_time, row.departure_time, Number(row.stop_sequence)];
      if (rows) rows.push(entry);
      else rowsByRoute.set(routeId, [entry]);

      // Same parsing as the loaders (a missing direction_id is NaN and isn't counted).
      if (directionId !== 0 && directionId !== 1) continue;
      const counts = stopCountsByRoute.get(routeId) ?? [new Map<string, number>(), new Map<string, number>()];
      counts[directionId].set(row.stop_id, (counts[directionId].get(row.stop_id) ?? 0) + 1);
      stopCountsByRoute.set(routeId, counts);
    }
  }

  mkdirSync(join(outDir, STOP_TIMES_DIR), { recursive: true });
  mkdirSync(join(outDir, GEOMETRY_DIR), { recursive: true });
  // Ordered pairs in the order the full scan first meets each stop/route, so ties resolve the same.
  const indexes: DerivedStopIndexes = {
    routeIdsByStop: [...stopRoutes].map(([stopId, routes]) => [stopId, [...routes]]),
    stopCountsByRoute: [...stopCountsByRoute].map(([routeId, [direction0, direction1]]) => [routeId, [[...direction0], [...direction1]]]),
  };
  writeFileSync(join(outDir, STOP_INDEXES_FILE), JSON.stringify(indexes));

  let shapes: Map<string, ShapePoint[]> | undefined;
  const directionalStops = agencyConfig(agencyId).directionalStops;
  for (const [routeId, rows] of rowsByRoute) {
    writeFileSync(join(outDir, STOP_TIMES_DIR, routeFileName(routeId)), JSON.stringify({ rows }));
    const input = {
      directionalStops,
      stopsById: staticData.stopsById,
      tripsById,
      byTrip: indexStopTimeRows(rows).byTrip,
      shapes: () => (shapes ??= readShapes(dataDir)),
    };
    const geometry: DerivedRouteGeometry = { 0: computeRouteGeometry(input, 0), 1: computeRouteGeometry(input, 1) };
    writeFileSync(join(outDir, GEOMETRY_DIR, routeFileName(routeId)), JSON.stringify(geometry));
  }
  // Last, so a manifest only ever describes a complete set of files.
  writeFileSync(join(outDir, MANIFEST_FILE), JSON.stringify({ version: DERIVED_VERSION, sources: derivedSources(dataDir) }));
  return { routes: rowsByRoute.size, stops: stopRoutes.size };
}
