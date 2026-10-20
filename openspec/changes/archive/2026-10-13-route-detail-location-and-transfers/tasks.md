# Tasks

## 1. Transfer data

- [x] 1.1 Add `scripts/generate_station_transfers.py` and generate `mobile/src/data/stationTransfers.ts` from the official feeds (LIRR, SCT, NICE, NYC Subway, MTA Bus Manhattan/Queens/MTA Bus Co). Verify the output lists `56` at Smithtown, the 1/2/3/A/C/E at Penn Station, and the 7 at Woodside, and contains no "City Terminal Zone".

## 2. Location on the live map

- [x] 2.1 Add `known` to `useCurrentLocation`, and pass `location`, `known`, and refresh from HomeScreen through `RouteDetailView` to `LirrRouteMap`. Wire the route-location button to refresh, center (via a request counter), and set selected, and clear selected on map pan. Verify with an App test that pressing the button calls the location refresh and selects it, and that the map's `showsUserLocation` is on.
- [ ] 2.2 Web: add the rider dot marker (only when location is known) and center-on-request. Verify with `npm run typecheck` and on web.

## 3. Timeline and transfers

- [x] 3.1 Slice the live timeline from the nearest station to the end of the selected direction. Verify with an App test at a pinned clock: westbound starts "Stony Brook, departs" at now + lead and ends at Penn Station without Port Jefferson, and eastbound shows Stony Brook then Port Jefferson.
- [x] 3.2 Render transfer chips (route colors, subway circles, cap of 8 plus `+N`, an accessibility label listing every transfer). Verify with App tests that Smithtown's row shows a `56` chip and that a busy station shows 8 chips plus `+N`.

## 4. Integration check

- [ ] 4.1 Run `npm run typecheck`, `npm run lint`, and `npm test`, then check on web and a device that the location dot, centering, timeline, and chips look right in light and dark themes.
