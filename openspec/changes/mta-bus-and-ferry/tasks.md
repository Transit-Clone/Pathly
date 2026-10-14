# Tasks

## 1. Feeds and pipeline

- [ ] 1.1 Measure each new feed with a one-off script in the scratchpad (not committed): extracted bytes per file, `stop_times.txt` rows, routes, stops, and peak memory while deriving. Also check that `stop_times.txt` rows are grouped by trip. Record the numbers in this task when done.
  - Measured 2026-10-14 (peak derivation memory not yet measured: today's pipeline rejects these feeds at extraction):

    | Feed | ZIP | Extracted | stop_times rows | Trips | Max stops/trip |
    |---|---|---|---|---|---|
    | Brooklyn | 19.6 MB | 164.5 MB | 2,400,187 | 58,357 | 82 |
    | Bronx | 9.6 MB | 82.3 MB | 1,160,378 | 41,156 | 50 |
    | Manhattan | 9.5 MB | 81.5 MB | 1,174,914 | 37,872 | 81 |
    | Queens | 6.8 MB | 58.5 MB | 817,866 | 31,199 | 45 |
    | Staten Island | 7.5 MB | 60.6 MB | 804,835 | 16,524 | 115 |
    | MTA Bus Co | 9.6 MB | 83.6 MB | 1,077,031 | 45,424 | 45 |
    | NYC Ferry | 36 KB | 0.2 MB | 3,386 | 576 | 9 |

    `stop_times.txt` is grouped by trip in every feed. Every NYCT borough feed carries the same `routes.txt` (307 routes), with trips only for its own borough.
  - **Finding:** prepared per-route stop times are roughly the size of `stop_times.txt` as JSON (Brooklyn about 150 MB). Instances write every agency's prepared files into `/tmp`, which is held in memory, so hydrating all six bus agencies (as `findNearbyTransit` does) would need about 500 MB more per 1 GiB instance. The design's statement that callables are unchanged doesn't hold; see the open question added to design.md.
- [x] 1.2 Sample one Bus Time `tripUpdates` response (with the user's key) and one NYC Ferry `tripupdate` response. Check whether their trip IDs match the static `trips.txt`, and record the result for `realtimeTripIdsMatchStatic`.
  - Result (2026-10-14): Bus Time trip IDs match the borough feeds' `trips.txt` (all 3 sampled, for example `GH_D6-Weekday-SDon-082200_BX16_307` on BX34 in the Bronx feed), so buses set `realtimeTripIdsMatchStatic: true`. NYC Ferry trip IDs match too (`762` on SG), but its trip updates leave `route_id` empty, so `gtfsStatus.ts` now falls back to `trips.txt` for a trip update's route, as it already did for vehicles.
- [ ] 1.3 In `gtfsSnapshots.ts`, add per-agency `snapshotLimits` and stream `stop_times` derivation per route (with the out-of-order spill fallback). Verify with tests: the existing four agencies derive identical output to before, a synthetic 3M-row feed derives under a fixed memory ceiling, and an over-limit archive is still rejected.

## 2. Agencies

- [ ] 2.1 In `gtfsAgencies.ts`, add `bx`, `bk`, `mn`, `qn`, `si`, `busco`, and `nycferry` with `busTimeFeedRequests()` and the ferry trip-update feed. Make `requiredStaticFallbacks` optional, and skip an agency without a snapshot. Add small test fixtures under `test/fixtures/gtfs/<agency>/`. Wire the `MTA_BUS_TIME_API_KEY` secret into the live-status callables. Update the header comment (Bus Time has GTFS-RT). Verify with tests:
  - discovery near a Manhattan fixture point returns M15 and M15-SBS;
  - live status with a stubbed Bus Time response marks a trip tracked;
  - without the key, it gives scheduled, untracked times;
  - a ferry route has predictions and no vehicles.
- [ ] 2.2 In `tripFares.ts`, add the NYC Ferry fare (with source and effective date) and make sure the MTA bus agency names are priced, including express and SBS. In `tripPlanning.ts`, map `FERRY` → `ferry`. Verify with `tripFares.test.js` and `tripPlanning.test.js`. Run `npm test` and `npm run build`.

## 3. Client

- [ ] 3.1 Add `ferry` to `TransitMode` and `TripMode`, the `ferry` icon, the ferry badge treatment and its accessibility label, the "Ferry" Modes chip (client-side filtering only), and the MTA Bus and NYC Ferry entries in `RouteDetailView`'s agency table and `transitModeForAgency`. Verify with component tests for the badge shape and label, and an App test where excluding Ferry hides a ferry itinerary while the request's modes are unchanged.

## 4. Integration check

- [ ] 4.1 The user registers the Bus Time key and sets the secret. Deploy, trigger the GTFS refresh, and confirm that snapshots are published for all seven agencies. On web at phone width, with a mock location (see `admin-debug-tools`) at Midtown, the St. George Ferry Terminal, and Wall St/Pier 11:
  - check Nearby;
  - open a bus route, an SBS route, and a ferry route;
  - plan a trip that uses the SIM3C and one that uses NYC Ferry, and check the badges, stops, and fares.

  Run all test suites.
