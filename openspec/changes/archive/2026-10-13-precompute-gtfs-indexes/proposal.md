# Proposal

## Why

After the backend has been idle, the first nearby search is slow. A local cold run of `findNearbyTransit` takes about 18 s (Stony Brook 18.3 s, Midtown 18.0 s). Almost all of that is reading the agencies' `stop_times.txt` files, which total about 59 MB (37 MB for the subway), twice:
- Building the "which routes stop here" index scans every agency's file: about 10.7 s (subway 4.9 s, NICE 3.5 s, Suffolk 2.0 s, LIRR 0.3 s).
- Loading each nearby route's stop times then streams the files again.

Each Cloud Function instance repeats this on its first request. Keeping instances warm would hide the cost but needs `minInstances`, which costs money. Doing the work once at deploy time is free.

## What Changes

- **New build step:** a script reads each agency's `stop_times.txt` once and writes derived files next to the feed:
  - a stop → routes index;
  - one small stop-times file per route.

  It records which source files it was built from, and it skips agencies whose feed hasn't changed.
- **Loaders use the derived files:**
  - the stop → routes index and a route's stop times are read from the derived files when present (a few KB to a few MB, instead of scanning the whole feed);
  - without derived files (for example a fresh checkout), they fall back to streaming the CSV as today, so local development keeps working.
- **Deploy:**
  - Deploys build the derived files automatically: a step is added to the existing `predeploy` in `firebase.json`.
  - Deploys fail if any agency's derived files are missing or stale.
  - The raw `stop_times.txt` files are left out of the deployed bundle, since production reads only the derived files.
- **Repository:** derived files are generated, not committed (`.gitignore`).
- **No change to results:** nearby routes, predictions, departures, and route geometry are identical to scanning the CSVs.

### Not in this change
- Warm instances (`minInstances`), batching live calls, and an on-device cache. These stay optional follow-ups; this change uses only free options.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Added:** "Nearby search responds quickly after the backend is idle".

## Impact

- **Backend (`firebase/functions`):**
  - New `scripts/build-gtfs-index.js` and a `build:gtfs` npm script.
  - `src/gtfsStaticData.ts`: `loadGlobalStopRouteIndex` and `loadRouteStopTimes` read derived files, with the CSV fallback.
  - New `static_data/<agency>/derived/` output, which is gitignored.
- **Config:** `firebase.json` gets a predeploy step and ignores `static_data/*/stop_times.txt`; `.gitignore` gets the derived output.
- **Tests:**
  - A functions test checks that derived and CSV loading give identical results for sample routes and stops.
  - The existing callable security tests stay green.
- **Cost:** none. Build time goes up by about 20 s per deploy, once.
- **Requires redeploying functions** to take effect.
