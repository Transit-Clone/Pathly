# Design

## Context

- **Loading today:** `gtfsStaticData.ts` loads each agency's small files (routes, stops, trips, calendars) synchronously on first use, which takes about 0.55 s in total. Two loaders stream `stop_times.txt`:
  - `loadGlobalStopRouteIndex(agencyId)` builds `stop_id → Set<route_id>` with a full scan. It is used by `findNearestStops` in `gtfsDiscovery.ts`.
  - `loadRouteStopTimes(agencyId, routeId)` keeps the requested routes' rows, indexed `byStop` and `byTrip`. It batches routes requested in the same tick into one scan per agency, and is used by geometry, nearby discovery, and `getStopPredictions`.
- **Cost:** both caches are per instance, so every cold Cloud Functions instance pays the scans again. Measured locally, a cold `findNearbyTransit` takes about 18 s. The index scan alone takes about 10.7 s: subway 4.9 s, NICE 3.5 s, Suffolk 2.0 s, LIRR 0.3 s.
- **Feed sizes:** `stop_times.txt` is 1.3 MB for LIRR, 11 MB for NICE, 9.6 MB for Suffolk, and 37 MB for the subway. `static_data/` totals 77 MB and is deployed as part of the functions source.
- **Constraints:** no paid options (no `minInstances`); keep results identical; keep local development working without an extra step.

## Goals / Non-Goals

**Goals:**
- Cold `findNearbyTransit` drops from about 18 s to a few seconds, with route stop times and the stop index read from small prebuilt files.
- Deploys always ship prebuilt data that matches the feed; they never fall back to scanning in production.
- Results stay identical to the CSV scan.

**Non-Goals:**
- Prebuilding `trips.txt`, `stops.txt`, or `shapes.txt`. They are already fast enough, or (shapes) loaded lazily per agency.
- Warm instances, request batching, client caching.
- Changing how feeds are downloaded or updated.

## Decisions

### 1. Derived files per agency
`static_data/<agency>/derived/` will contain:
- **`stop-routes.json`:** `{ [stopId]: routeId[] }`. Route ids stay in the order they first appear in the feed, matching the scan, because that order can break ties in nearby results.
- **`stop_times/<encodeURIComponent(routeId)>.json`:** `{ rows: [tripId, stopId, arrivalTime, departureTime, stopSequence][] }`, in the source file's row order.
  - Row order matters: `byStop` and `byTrip` lists are built in file order today, and the per-route file preserves it, so downstream sorting and tie-breaking behave identically.
  - Arrays instead of objects roughly halve the file size and parse time.
  - Route ids are percent-encoded so ids with `/`, `+`, or spaces are safe filenames.
- **`manifest.json`:** `{ version: 1, sources: { "stop_times.txt": { size, mtimeMs }, "trips.txt": { size, mtimeMs } } }`. It records the inputs the output depends on. Trip → route mapping comes from `trips.txt`, so it counts as an input.

Alternatives considered:
- **One binary or SQLite file per agency:** adds a native dependency and complexity for a small gain over JSON.
- **Storing in Firestore or Cloud Storage:** adds network reads on cold start, which may cost money at scale.
- **Committing derived files to git:** about 60 MB of generated churn on each feed update.

### 2. Build script
- `firebase/functions/scripts/build-gtfs-index.js` is plain Node and uses the existing `csv-parse` dependency.
- For each agency in `gtfsAgencies.ts` it:
  1. reads `trips.txt` for trip → route;
  2. streams `stop_times.txt` once, building both the stop index and per-route row lists;
  3. writes the files into a temporary directory and renames it into place, so a failed run never leaves a half-written `derived/`;
  4. writes the manifest last.
- It skips an agency whose manifest matches its sources' current `size`/`mtimeMs`. `--force` rebuilds everything.
- `--check` builds nothing and exits non-zero if any agency's derived data is missing or stale. The predeploy step uses it after building, as a belt-and-braces check.
- It runs on the compiled agency config: `require('../lib/gtfsAgencies')` after `tsc`, to get each agency's `dataDir` without duplicating it.
- npm scripts:
  - `"build:gtfs": "npm run build && node scripts/build-gtfs-index.js"`.
  - `serve` and `test` also run `build:gtfs`, so the emulator and tests exercise the fast path. The equivalence test also covers the fallback.

### 3. Loaders prefer derived files, fall back to the CSV
- `loadGlobalStopRouteIndex`: if `derived/stop-routes.json` exists and its manifest matches the sources, parse it into `Map<string, Set<string>>`; otherwise run the current scan.
- `loadRouteStopTimes`:
  - If derived data is valid for the agency, read `stop_times/<route>.json` (or treat a missing file as a route with no rows, as today) and build `byStop`/`byTrip` from its rows in order.
  - Otherwise use the current batched stream.
  - The per-route promise cache stays as it is.
- **Manifest check:** done once per agency per instance and cached. It is a `statSync` comparison only.
- **Bundled deploys:** in production the raw `stop_times.txt` isn't deployed (see 4), and file modification times aren't guaranteed to survive the upload. So when `stop_times.txt` is absent, the prepared files are the only data and are used whenever the manifest's format version matches. Their freshness was already verified by `--check` at deploy time.

### 4. Deploy wiring
- `firebase.json` functions:
  - `predeploy`: `["npm --prefix firebase/functions run build", "npm --prefix firebase/functions run build:gtfs", "node firebase/functions/scripts/build-gtfs-index.js --check"]`.
  - `ignore` adds `static_data/*/stop_times.txt`, so the 59 MB of raw stop times aren't uploaded. The prebuilt files replace them in production; other CSVs are still deployed.
- `.gitignore` adds `firebase/functions/static_data/*/derived/`.
- **Root script:** `deploy:functions` in the root `package.json` builds before calling `firebase deploy`, and `firebase deploy` runs the predeploy hooks anyway, so no root change is needed beyond keeping it consistent.

### 5. Verifying equivalence
- New `test/gtfsIndex.test.js` (`node --test`). For each agency, on a sample of route ids (all 13 LIRR routes; 5 routes each for subway, NICE, and Suffolk, including the busiest by row count) and sample stops:
  - it compares `loadRouteStopTimes` via derived files against the CSV stream, and the derived stop index against the scanned one, with deep equality;
  - it uses a helper that forces the fallback path (`process.env.GTFS_DERIVED_DISABLED = '1'`) in a separate module instance, so both paths run in one test.
- A timing check runs as a script, not a test (timings are flaky in CI): the existing local cold-run script before and after, recorded in tasks.

## Risks / Trade-offs

- **Stale derived data after a feed update.** → The manifest check makes the loaders ignore stale data locally (falling back to scanning). `--check` fails the deploy. Re-running `build:gtfs` fixes both.
- **Upload size or file count.** There are 111 routes in total (LIRR 13, subway 28, NICE 45, Suffolk 25), so 111 route files plus 4 indexes and 4 manifests. That's about 50–60 MB uncompressed and much less zipped, roughly what the raw `stop_times.txt` costs today. → Excluding the raw files keeps the bundle about the same size.
- **mtime differences across machines** (for example after a git checkout) could mark data stale. → This only causes a rebuild; the inputs are local feeds and the derived data isn't committed.
- **Memory:** reading one route's JSON is far smaller than streaming the whole file, and the stop index JSON is about the same size as the in-memory Map built today, so there's no increase.
