# Design

## Context

- **Derived data today** (`precompute-gtfs-indexes`):
  - `scripts/build-gtfs-index.js` writes `static_data/<agency>/derived/` with `stop-indexes.json`, `stop_times/<route>.json`, and `manifest.json` (`DERIVED_VERSION = 2`).
  - `useDerived()` in `gtfsStaticData.ts` uses that output when its manifest matches the source files. When `stop_times.txt` is absent (as in a deploy, which ignores it), the derived output is always used.
- **Daily snapshots** (`gtfsSnapshots.ts`):
  - `refreshGtfsStaticData` publishes `<root>/<agency>/versions/<sha>.zip` (the runtime `.txt` files only) and a `current` manifest.
  - On each cold callable, `prepareAgencyStaticData` → `hydrateCurrentGtfsSnapshot` downloads the archive, verifies it, and writes the raw files to `/tmp/pathly-gtfs/<agency>/<version>/`. The loaders then read that directory.
  - That directory has `stop_times.txt` and no `derived/`, so `useDerived()` is false. Every hydrated cold instance streams the full CSVs.
  - Production logs show published snapshots for all four agencies, so this is the live path today.
- **Manifest parsing:** `parseGtfsSnapshotManifest` checks known fields and ignores unknown ones. Instances still on the old code therefore tolerate an additive manifest field.
- **Geometry:**
  - `getRouteGeometry` in `gtfsDiscovery.ts` reads `loadRouteStopTimes`, picks the longest trip in the direction, chains matching trips at both ends (rebasing their times), and joins their shapes via `loadAgencyShapes`, which parses all of `shapes.txt`.
  - The result depends only on the timetable files, not on the date or the request.
- **Callables:** run with `concurrency: 1`. Each one first runs `enforceCallableSecurity`, which includes a Firestore transaction in `us-central1`.
- **Client:** `fetchNearbyTransit` runs once a location (or the map center) is known. `fetchRouteGeometry` keeps a per-session in-memory cache.

## Goals / Non-Goals

**Goals:**
- Hydrated snapshots use derived data, with the same validity rules and fallback as the deploy bundle.
- Geometry requests do no timetable or shape parsing when derived data is present.
- The first cold start overlaps the app's own startup, without creating an extra instance.

**Non-Goals:**
- Changing the snapshot's runtime file contract, its validation, or how the live version is chosen.
- Device-side geometry caching, geometry prefetch, `minInstances`, merging callables, and changing regions.

## Decisions

### 1. One shared builder for deploys and the refresh job
- Move the body of `buildAgency` from `scripts/build-gtfs-index.js` into `src/gtfsDerivedBuild.ts`, as `buildDerivedData(agencyId, dataDir, outDir)`:
  - it reads `trips.txt`, `stops.txt`, `shapes.txt`, and `stop_times.txt` from `dataDir`;
  - it writes the derived layout into `outDir`.
- The script keeps its CLI (`--force`, `--check`, temp-dir swap, Windows rename retry) and calls the compiled builder.
- The refresh job calls the same function.
- Alternative: keep the JS script and spawn it from the job. Rejected because the bundle would need the script and child-process handling, and the two copies could drift.

### 2. Geometry computed by a pure function, written per route
- Split `getRouteGeometry` into a loader wrapper (still in `gtfsDiscovery.ts`) and a pure `computeRouteGeometry({ directionalStops, stopsById, tripsById, byTrip, shapes }, directionId)` in a new `gtfsGeometry.ts`. `shapes` is a function, so the CSV fallback still parses `shapes.txt` only when a direction has trips. Both the builder and the CSV fallback call `computeRouteGeometry`, so they share one implementation.
- The directory-based file readers (`readAgencyStaticData(dataDir)`, `readShapes(dataDir)`, `gtfsTimeToSeconds`, the GTFS types) move from `gtfsStaticData.ts` into a new `gtfsFeed.ts`, and `gtfsStaticData.ts` re-exports what its importers used. The builder therefore depends only on `gtfsFeed`, `gtfsGeometry`, and `gtfsDerived`. Without this, the import chain `gtfsSnapshots → builder → gtfsStaticData → gtfsSnapshots` would be circular.
- The builder writes `derived/geometry/<encoded routeId>.json` as `{ "0": RouteGeometry | null, "1": RouteGeometry | null }`, for every route that has stop times.
- At runtime, when `useDerived(agencyId)` is true, `getRouteGeometry` reads that file (cached per route per instance, like stop times).
  - A missing file or a `null` direction → `null` → the callable's existing `not-found`.
  - Otherwise it computes as today.
- Bump `DERIVED_VERSION` to 3. Existing output is then rebuilt, and snapshots with v2 derived data (none exist yet) would be treated as stale.
- Alternative: one `geometry.json` per agency. Rejected because it would be read whole on the first geometry request, which repeats the cold-cost problem in a smaller form. Per-route files keep cold start unchanged.

### 3. Snapshots reference a separate derived archive
- **Manifest field:** add an optional `derived` field to `GtfsSnapshotManifest`: `{ version: number; object: string; sha256: string; size: number }`.
- **Object path:** `<root>/<agency>/derived/<snapshot version>-v<DERIVED_VERSION>.zip`.
  - The path is content-addressed by the snapshot version and the format version.
  - It is uploaded with `ifGenerationMatch: 0`; an existing object is verified by hash, the same way `ensureSnapshotArchive` handles archives.
- **Parsing:**
  - `parseGtfsSnapshotManifest` validates `derived` when present: path pattern, hash, and size bound.
  - It does not require the field, and it does not change `version`, which stays the hash of the runtime files.
  - The field is additive, so `SNAPSHOT_SCHEMA_VERSION` stays the same and old instances ignore it.
- **Why a separate archive:** the runtime archive and its hash stay exactly as published. "Content unchanged" logic is unaffected, and derived output can be added or rebuilt (format bump) without minting a new timetable version.
- **Rejected alternative 1:** putting the derived files inside the runtime zip. That changes the archive hash, and existing snapshots could not be backfilled without a new version.
- **Rejected alternative 2:** building derived output in `/tmp` during hydration. That moves the full scan onto the cold request, which is what this change removes.

### 4. Refresh job builds, publishes, and backfills
- **New content:**
  1. Extract the runtime files to a staging directory under `os.tmpdir()`.
  2. Run `buildDerivedData` and zip the output with `fflate` (already a dependency).
  3. Upload the derived archive.
  4. Set `manifest.derived`, then publish the manifest last, as today.
- **Unchanged content:** if `current.manifest.derived` is missing or its `version` ≠ `DERIVED_VERSION`, build from the freshly downloaded (identical) feed, upload, and rewrite the manifest under the existing generation precondition. Log `gtfs_snapshot_derived_backfilled`.
- **Build failure:** a failed derived build never blocks a timetable update. Log `gtfs_snapshot_derived_failed` and publish without `derived`, so instances use the slow but correct path.
- **Cleanup:** always remove the staging directory.
- **Memory:** the job keeps `memory: '1GiB'` (the subway build peaks at a few hundred MB locally). Raise it to `2GiB` only if the tasks' measurement shows it is needed.

### 5. Hydration extracts derived output and omits the raw stop times
- When `manifest.derived?.version === DERIVED_VERSION`, `hydrateManifest` also downloads the derived archive, verifies its size and hash against the manifest, and extracts it into `<dataDir>/derived/`.
  - Separate size bounds: archive ≤ 32 MB, extracted ≤ 160 MB.
  - Entries must be under `stop-indexes.json`, `manifest.json`, `stop_times/`, or `geometry/`, with no path traversal.
- With valid derived output, it does not write `stop_times.txt` to `/tmp`. `useDerived()` then takes its existing "no raw stop times" branch, exactly as in a deploy. This also keeps `/tmp`, which is held in RAM, about the same size as today.
- Any failure on the derived archive (missing object, hash mismatch, bounds) is logged as `gtfs_snapshot_derived_unavailable`. Hydration then writes the full raw files as today, and the slow path stays correct.
- The staged folder is moved into place by `renameIntoPlace`. Windows reports an existing content-addressed target as `EPERM` (Linux: `ENOTEMPTY`), so a locked rename onto an existing target counts as "already hydrated", and a locked rename onto a missing target is retried. This only affects local runs, and it fixed a snapshot test that had failed on Windows since its target folder first existed.
- The existing 10 s `SNAPSHOT_CHECK_TIMEOUT_MS` covers both downloads. If both are slow, the existing fallback to the deploy bundle applies, and the bundle has derived data.

### 6. Warm-up requests
- **Backend:**
  - `findNearbyTransit` and `getRouteGeometry` accept `{ warmup: true }`. After `enforceCallableSecurity` (so warm-ups are authenticated and rate-limited like any call), they run `prepareAgencyStaticData` for every agency and load what that endpoint's first real request needs:
    - nearby: `loadAgencyStaticData` and the stop indexes for each agency;
    - geometry: hydration only.
  - They then return `{ warmed: true }` and no transit data.
- **Client:**
  - New `mobile/src/data/backendWarmup.ts`, with `warmBackend(uid)` and `whenWarm(name, capMs)`:
    - `warmBackend` fires both callables once per uid per session and stores their settled promises.
    - `whenWarm` resolves when the named warm-up settles (success or failure) or after `capMs` (8 s), whichever comes first.
  - `AuthContext` calls `warmBackend` when a user becomes available.
  - `fetchNearbyTransit` and `fetchRouteGeometry` `await whenWarm(...)` before calling. After the first settle, this costs nothing.
- **Why wait:** with `concurrency: 1`, a real request that arrives while the warm-up is still running is routed to a second, equally cold instance. Waiting sends it to the instance the warm-up just prepared. The cap bounds the downside if a warm-up hangs.
- **Rejected alternative:** a scheduled keep-warm ping. Cloud Run may still shut down idle instances, and it warms instances even when nobody is using the app.

### 7. Region stays `us-central1`
- `findNearbyTransit` and the other callables each run a Firestore transaction (read + commit) against the `us-central1` database before any work.
- From `us-east4`, each transaction would make two or more cross-region round trips (roughly 25–30 ms each), adding about 50–90 ms per call. That is more than the roughly 30 ms saved on the rider's trip from New York.
- Revisit only if rate limiting stops using Firestore on the hot path.

## Risks / Trade-offs

- [Derived archive and runtime archive disagree] → The derived archive's object path includes the snapshot version. Hydration only uses a derived archive whose manifest entry belongs to the manifest being hydrated, and it verifies the hash.
- [Refresh job runs out of memory or time while building the subway] → Measure peak RSS and duration in the tasks. The job has 540 s, and a failed build still publishes the timetable (decision 4).
- [Warm-up uses a rate-limit token] → Nearby's limit is generous for a single call. A warm-up rejected for rate limiting is ignored.
- [Warm-up wait delays the first search when the warm-up is slow] → The cap is 8 s, and the device-cached nearby list is already shown during that time.
- [Geometry output drifts between builder and fallback] → One shared `computeRouteGeometry`, plus an equivalence test across agencies.

## Migration Plan

1. Deploy functions. The bundle's derived data is now v3, with geometry.
2. Trigger `refreshGtfsStaticData` once from the Cloud Scheduler console ("Force run"), or wait for the 4 AM run. Confirm a `gtfs_snapshot_derived_backfilled` log line per agency.
3. After the functions have been idle, confirm a `gtfs_snapshot_hydrated` log line, a fast first nearby search, and a fast first route detail.

**Rollback:**
- Redeploying the previous functions is safe. Old code ignores `manifest.derived` and reads the raw files, which are still in every runtime archive.
- Derived objects can be left in Storage or deleted.
