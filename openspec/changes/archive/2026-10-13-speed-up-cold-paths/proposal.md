# Proposal

## Why

The first nearby search and the first route detail after the backend has been idle are still slow. Three reasons were found:

- **The prepared timetable data is not used in production.** `precompute-gtfs-indexes` builds derived files into the deploy bundle. However, the daily `refreshGtfsStaticData` job has published Cloud Storage snapshots for all four agencies. Every cold instance downloads the current snapshot into `/tmp` and reads from there, and the snapshot contains only the raw GTFS `.txt` files. With no `derived/` folder, the loaders silently fall back to streaming the full `stop_times.txt` (about 35 MB for the subway), which is the slow path that change was meant to remove.
- **Route geometry is recomputed on every request.** `getRouteGeometry` reads the route's full stop-times file (up to 3 MB), chains trips together, and parses the agency's whole `shapes.txt` the first time that agency is requested. The answer is the same for every rider until the timetable changes.
- **The cold start begins only when the rider needs the answer.** The nearby search starts only after a location fix, so the instance's startup cannot overlap anything the app is already waiting on.

## What Changes

- **Snapshots carry the prepared data.**
  - The daily refresh job builds the same derived output that deploys build and publishes it with the snapshot.
  - Cold instances hydrate it with the raw files, so production uses the fast path again.
  - Snapshots published before this change get the derived output backfilled on the next refresh run, even if the feed is unchanged.
- **Route geometry is precomputed.**
  - The derived build also writes each route's geometry for both directions.
  - `getRouteGeometry` reads that small file instead of computing it.
  - Without derived files, it computes the same result as today.
- **The backend is warmed when the app opens.**
  - Once the rider is signed in, the app sends a lightweight warm-up request to the nearby search and route geometry functions, without waiting for a reply.
  - The first real request in each function waits for that warm-up to finish, up to a limit, so it reaches the instance the warm-up started instead of starting a second one.
- **No change to results.** Nearby routes, departures, predictions, and route geometry stay identical.

### Not in this change
- **Moving functions to `us-east4`.** This was considered and rejected: Firestore is in `us-central1`, and every callable runs a rate-limit transaction there before doing any work. Moving would turn each of those round trips into a cross-region one, which would likely cost more than the shorter trip from the rider saves. See design.md.
- Caching route geometry on the device, prefetching geometry for visible cards, warm instances (`minInstances`), and merging callables. These stay possible follow-ups.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Added:** "Route detail geometry is served from prepared data".
  - **Added:** "Daily timetable updates keep prepared data".
  - **Added:** "The backend is warmed when the app opens".

## Impact

- **Backend (`firebase/functions`):**
  - The derived build logic moves from `scripts/build-gtfs-index.js` into a compiled module, `src/gtfsDerivedBuild.ts`. The script and the refresh job share it, and the script becomes a thin wrapper.
  - Geometry computation in `src/gtfsDiscovery.ts` becomes a pure function the build can call. The callable reads `derived/geometry/<route>.json` when present.
  - `src/gtfsSnapshots.ts`:
    - The refresh job builds, uploads, and backfills a derived archive, and the snapshot manifest references it.
    - Hydration verifies and extracts it.
  - `DERIVED_VERSION` goes up, so older derived output is rebuilt.
  - `findNearbyTransit` and `getRouteGeometry` accept a `warmup` flag.
- **Mobile (`mobile/src/data`):** a new `warmBackend()` runs after sign-in. `fetchNearbyTransit` and `fetchRouteGeometry` wait briefly for it.
- **Storage:** one extra derived archive object per published snapshot version.
- **Tests:**
  - Derived geometry matches computed geometry for sample routes.
  - Hydration with and without the derived archive.
  - Backfill of an unchanged snapshot.
  - Client warm-up ordering.
- **Cost:** none beyond a few MB of Storage and a few seconds of refresh-job CPU per agency per day.
- **Requires redeploying functions**, then running the refresh job once (or waiting for the next 4 AM run) to backfill current snapshots.
