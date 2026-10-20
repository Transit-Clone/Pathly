# Tasks

## 1. Stability fix

- [x] 1.1 Keep the nearby list during re-fetches (a `refreshing` state), store the opened route in `activeView`, include it in `TransitLiveProvider.extraRoutes`, and remove the render-time `showHome()`. Verify with an App test that a route detail stays open after the mocked location changes and the nearby fetch returns without that route.

## 2. Backend

- [x] 2.1 Enable the timetable fallback for every agency (directional stops looked up per direction) with next-service-day lookahead until 3 entries per direction. Verify with a functions test or script run against static data for a late-night time showing 3 entries for subway E, NICE, Suffolk, and LIRR.
- [x] 2.2 Read `shape_id` in `gtfsStaticData`, add a lazy per-agency shapes loader, and return a trimmed, simplified `path` from `getRouteGeometry`. Verify with `npm run build` and a local run printing path lengths for LIRR 10 and Suffolk 51 in both directions.
- [x] 2.3 Add an adaptive radius to `findNearbyTransit` (passes 1/2/4/8×, per-agency caps, ≥ 8 routes, cap of 30). Verify with a local run at a suburban point (Stony Brook) returning about 8+ routes and at Midtown not widening.
- [x] 2.4 Make `getRouteLiveStatus` accept optional `lat`/`lon` and return `nearestStop`. Verify with a local run returning departures and nearest stops in one call.

## 3. Data layer

- [x] 3.1 `TransitLiveContext`: one call per route via the merged endpoint (falling back to the two-call flow if `nearestStop` is absent), per-route status updates, and `fetchedAt` on data. Verify with an App test that a card fills in while another route's mocked call is still pending.
- [x] 3.2 `routeGeometry`: `path?` in the type; route detail fetches geometry on mount in parallel. Delete `portJeffersonShape.ts` and use `geometry.path ?? stops` in `RouteMap`. Verify with an App test that the map line uses the mocked geometry path.

## 4. Route detail and cards

- [x] 4.1 Prediction tiles: fixed third-width; `0 minutes` when due; past entries dropped (using `fetchedAt` and a 30 s tick); clock time when 60+ min away; scheduled opacity 0.45; border 3. Apply the same timing helper to `TransitCard`. Verify with App tests for a 0 tile, a dropped past tile, a `5:00 PM` tile, three tiles from one live and two scheduled, and the styles.
- [x] 4.2 Destination-only labels via `directionDestination` (route title, page dots, cards) and headsign-only `direction` for discovered routes. Verify with App tests that no "Westbound to" or "Toward" text renders.
- [x] 4.3 Card title uses `shortName`. Verify with an App test that the 51 card's title is "51".
- [x] 4.4 Remove the fare row from route detail. Verify with an App test that no `route-fare` exists for the Port Jefferson Branch or the E.
- [x] 4.5 Transfers filter (other agency or mode only). Verify with an App test that Jamaica on the Port Jefferson Branch shows no LIRR branch chips but shows subway and bus chips.

## 5. Save star

- [x] 5.1 Merge pin and favorite into `savedRouteIds`, remove the pin button and `DEFAULT_PINNED_ROUTE_IDS`, show saved routes first in Nearby with a star marker and in Favorites. Rewrite the pin and favorite App tests. Verify with tests for save, unsave, and the empty default.

## 5b. Vehicle markers

- [ ] 5b.1 Make the vehicle marker a white circle (not a square) and invert the marker and age badge colors on native (`RouteMap.native.tsx` styles) and web (`vehicleIconUrl` SVG), adding a subtle shadow for contrast on light tiles. Verify with an App test that the vehicle badge is circular (border radius equal to half its size) with a white background and route-color border, and that the age badge has a route-color background with white text. Check both themes on web.

## 6. Home center search

- [x] 6.1 `GoogleMapView` reports the map center after user gestures. HomeScreen `searchCenter` with the purple circle overlay, debounced nearby re-query, and the location button reset. Add the palette token. Verify with an App test that a mocked region change shows the circle and calls `findNearbyTransit` with the new center, and that pressing location hides it.

## 7. Integration check

- [ ] 7.1 Run `npm run typecheck`, `npm run lint`, `npm test` (mobile) and `npm run build` (functions). Deploy functions. On web, check first-load speed, tiles, labels, the save star, shapes for an LIRR, a bus and a subway route, center search, and that route detail no longer bounces home.
