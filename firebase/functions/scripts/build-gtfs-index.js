#!/usr/bin/env node
/**
 * Prepares each agency's timetable for fast cold starts: reads stop_times.txt once and writes,
 * under static_data/<agency>/derived/,
 *   - stop-indexes.json       which routes call at each stop, and per route + direction how many
 *                             trips call at each stop (ordered pairs, in feed order)
 *   - stop_times/<route>.json { rows: [tripId, stopId, arrival, departure, sequence][] }
 *   - manifest.json           the source files (size + mtime) the output was built from
 * so src/gtfsStaticData.ts reads a few small files instead of scanning the whole feed.
 *
 * Usage (after `npm run build`, which compiles the agency config this reads):
 *   node scripts/build-gtfs-index.js           build agencies whose output is missing or stale
 *   node scripts/build-gtfs-index.js --force   rebuild every agency
 *   node scripts/build-gtfs-index.js --check   build nothing; exit 1 if any agency is missing or stale
 */
const { parse } = require('csv-parse');
const { parse: parseSync } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const { DERIVED_DIR, DERIVED_VERSION, MANIFEST_FILE, STOP_INDEXES_FILE, STOP_TIMES_DIR, derivedSources, routeFileName } = require('../lib/gtfsDerived');

const STATIC_DATA_ROOT = path.join(__dirname, '../static_data');

/** True when `dir`'s manifest matches the current source files. */
function isCurrent(dataDir) {
  const manifestPath = path.join(dataDir, DERIVED_DIR, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return manifest.version === DERIVED_VERSION && JSON.stringify(manifest.sources) === JSON.stringify(derivedSources(dataDir));
  } catch {
    return false;
  }
}

/**
 * Renames the finished output into place. Windows can briefly lock just-written folders
 * (antivirus, search indexer), so the rename is retried, then falls back to a copy.
 */
async function moveIntoPlace(from, to) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  fs.cpSync(from, to, { recursive: true });
  fs.rmSync(from, { recursive: true, force: true });
}

async function buildAgency(agencyId, dataDir) {
  const tripRows = parseSync(fs.readFileSync(path.join(dataDir, 'trips.txt'), 'utf-8'), { columns: true });
  const routeOfTrip = new Map(tripRows.map((row) => [row.trip_id, row.route_id]));
  // Same parsing as gtfsStaticData.ts (a missing direction_id is NaN and isn't counted).
  const directionOfTrip = new Map(tripRows.map((row) => [row.trip_id, Number(row.direction_id)]));

  const stopRoutes = new Map();
  const stopCountsByRoute = new Map();
  const rowsByRoute = new Map();
  const stopTimesPath = path.join(dataDir, 'stop_times.txt');
  if (fs.existsSync(stopTimesPath)) {
    const parser = fs.createReadStream(stopTimesPath).pipe(parse({ columns: true }));
    for await (const row of parser) {
      const routeId = routeOfTrip.get(row.trip_id);
      if (!routeId) continue;
      const routes = stopRoutes.get(row.stop_id);
      if (routes) routes.add(routeId);
      else stopRoutes.set(row.stop_id, new Set([routeId]));
      const rows = rowsByRoute.get(routeId);
      const entry = [row.trip_id, row.stop_id, row.arrival_time, row.departure_time, Number(row.stop_sequence)];
      if (rows) rows.push(entry);
      else rowsByRoute.set(routeId, [entry]);

      const directionId = directionOfTrip.get(row.trip_id);
      if (directionId !== 0 && directionId !== 1) continue;
      const counts = stopCountsByRoute.get(routeId) ?? [new Map(), new Map()];
      counts[directionId].set(row.stop_id, (counts[directionId].get(row.stop_id) ?? 0) + 1);
      stopCountsByRoute.set(routeId, counts);
    }
  }

  // Written to a temporary directory and swapped in, so a failed run never leaves half an index.
  const derivedDir = path.join(dataDir, DERIVED_DIR);
  const tempDir = `${derivedDir}.tmp-${process.pid}`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(tempDir, STOP_TIMES_DIR), { recursive: true });
  // Ordered pairs in the order the full scan first meets each stop/route, so ties resolve the same.
  const indexes = {
    routeIdsByStop: [...stopRoutes].map(([stopId, routes]) => [stopId, [...routes]]),
    stopCountsByRoute: [...stopCountsByRoute].map(([routeId, [direction0, direction1]]) => [routeId, [[...direction0], [...direction1]]]),
  };
  fs.writeFileSync(path.join(tempDir, STOP_INDEXES_FILE), JSON.stringify(indexes));
  for (const [routeId, rows] of rowsByRoute) {
    fs.writeFileSync(path.join(tempDir, STOP_TIMES_DIR, routeFileName(routeId)), JSON.stringify({ rows }));
  }
  // Last, so a manifest only ever describes a complete set of files.
  fs.writeFileSync(path.join(tempDir, MANIFEST_FILE), JSON.stringify({ version: DERIVED_VERSION, sources: derivedSources(dataDir) }));
  fs.rmSync(derivedDir, { recursive: true, force: true });
  await moveIntoPlace(tempDir, derivedDir);
  return { stops: stopRoutes.size, routes: rowsByRoute.size };
}

async function main() {
  const force = process.argv.includes('--force');
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [agencyId, config] of Object.entries(AGENCY_CONFIGS)) {
    const dataDir = path.join(STATIC_DATA_ROOT, config.dataDir);
    if (check) {
      if (!isCurrent(dataDir)) stale.push(agencyId);
      continue;
    }
    if (!force && isCurrent(dataDir)) {
      console.log(`${agencyId}: up to date`);
      continue;
    }
    const started = Date.now();
    const { routes, stops } = await buildAgency(agencyId, dataDir);
    console.log(`${agencyId}: ${routes} routes, ${stops} stops in ${Date.now() - started} ms`);
  }
  if (check && stale.length > 0) {
    console.error(`Timetable indexes missing or out of date for: ${stale.join(', ')}. Run \`npm run build:gtfs\` in firebase/functions.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
