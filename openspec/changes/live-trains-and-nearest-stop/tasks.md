# Tasks

## 1. Backend timestamp

- [x] 1.1 Add `timestamp` (epoch seconds, `Long` unwrapped, `null` if missing) to `LirrVehicleStatus` in `firebase/functions/src/lirrStatus.ts`. Also take vehicle `directionId` from `trips.txt` (the feed omits it, and protobufjs defaults it to 0). Verify with `npm run build` in `firebase/functions` and a local run against the live feed showing numeric timestamps and both directions.
- [x] 1.2 Map `timestamp` to `updatedAt` (ms or `null`) in `mobile/src/data/lirrLive.ts`, and change `POLL_INTERVAL_MS` to 15 000 in `LirrLiveContext.tsx`. Verify with `npm run typecheck`.

## 2. Nearest station

- [x] 2.1 Add the GTFS `stopId` to each entry in `PORT_JEFFERSON_STOPS`, and create `mobile/src/data/nearestStop.ts`. Verify with unit tests: a point at Stony Brook station returns Stony Brook, a point in Smithtown returns Smithtown, and the fallback location returns Stony Brook.
- [x] 2.2 In `HomeScreen.tsx`, compute the nearest stop from `useCurrentLocation()`, use its `stopId` for `LirrLiveProvider`, and pass it to the route detail. Verify with an App test that the live function is called with the nearest stop's `stopId` (Stony Brook, `14`, under the test location fallback).
- [x] 2.3 Anchor the route-detail timeline so the nearest stop's time equals now plus the first prediction. Verify with an App test at a pinned clock that Stony Brook's row time matches the first tile.

## 3. Live map

- [x] 3.1 Pass the selected GTFS direction to `LirrRouteMap` and filter vehicles by `directionId` on native and web. Verify with an App test with two mocked vehicles in opposite directions: only one renders, and the other appears after switching direction.
- [x] 3.2 Add the per-second age badge (`Ns`/`Nm`/`Nh`) to train markers, and hide trains more than 5 minutes old, on native and web. Verify with `formatAge` unit tests and an App test using fake timers that the badge text counts up and a stale train is not rendered.
- [x] 3.3 Focus both maps on the nearest stop (native `initialRegion` plus `animateToRegion` until the rider pans; web `center`/`zoom` until the rider drags), and emphasize that stop's dot. Verify with an App test that the native map's `initialRegion` is centered on Stony Brook and that its dot uses the emphasized style.

## 4. Deploy and integration check

- [ ] 4.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`, and `npm run build` in `firebase/functions`. Then the user deploys with `firebase deploy --only functions`, and on web we confirm age badges, direction filtering, the nearest-station focus, and the 15 s refresh.
