# Tasks

## 1. Build script

- [x] 1.1 Add `firebase/functions/scripts/build-gtfs-index.js`. For each configured agency it reads `trips.txt`, streams `stop_times.txt` once, and writes `derived/stop-routes.json`, `derived/stop_times/<encoded routeId>.json` (rows in source order), and `derived/manifest.json` (source sizes and mtimes). It writes via a temporary directory and rename, skips agencies whose manifest is current, and supports `--force` and `--check`. Add the `build:gtfs` npm script and gitignore `static_data/*/derived/`. Verify with `npm run build:gtfs` producing 111 route files and 4 indexes, a second run skipping all agencies, and `--check` exiting 0 (and non-zero after touching a source `stop_times.txt`).

## 2. Loaders

- [x] 2.1 In `src/gtfsStaticData.ts`, make `loadGlobalStopRouteIndex` and `loadRouteStopTimes` read the derived files when the agency's manifest is valid (cached per agency; with no raw `stop_times.txt` present, as in a deploy, a manifest of the current format is always used). Fall back to the current CSV scans otherwise, or when `GTFS_DERIVED_DISABLED=1`. Verify with a new `test/gtfsIndex.test.js` that, for all LIRR routes and 5 routes each of subway, NICE, and Suffolk, derived and CSV results are deeply equal for route stop times and the stop index. Wire it into `npm test` and confirm the security tests still pass.
- [x] 2.2 Measure with the local cold-run script: cold `findNearbyTransit` at Stony Brook (40.9203, -73.1285) and Midtown (40.7549, -73.9840), before (about 18 s each) and after. Verify the "after" times are a few seconds, and that the returned route lists are identical before and after (compare JSON).

## 3. Deploy wiring

- [x] 3.1 Update `firebase.json`: add the `build:gtfs` and `--check` predeploy steps, and add `static_data/*/stop_times.txt` to `ignore`. Make `serve` run `build:gtfs`. Verify the predeploy commands succeed locally in order, and that the source paths the deploy would upload exclude raw `stop_times.txt` (check `firebase.json` ignore globs with a dry listing, e.g. `npx firebase-tools deploy --only functions --dry-run` if available, otherwise by inspection).
- [x] 3.2 Document in `README.md` (Functions section) that `npm run build:gtfs` prepares the timetable indexes, that deploys do it automatically, and that it must be re-run after updating the static feeds. Verify the documented command runs as written.

## 4. Integration check

- [ ] 4.1 Run `npm test` in `firebase/functions` and `npm test` in `mobile/`. Then the user deploys with `npx firebase-tools deploy --only functions`. On web, after the functions have been idle (about 15+ minutes, or right after the deploy), confirm the first nearby search returns within a few seconds.
