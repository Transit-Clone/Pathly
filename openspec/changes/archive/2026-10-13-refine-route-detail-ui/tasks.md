# Tasks

## 1. Route content cleanups

- [x] 1.1 In `mobile/src/components/RouteDetailView.tsx`, render the service-alert row and its expandable body only when `hasDelay` is true. Verify with App tests that the `ronkonkoma` route detail has no `service-alerts` control, and that the `s1` route detail shows it and expands to the "Minor traffic delays…" text.
- [x] 1.2 Remove the `Departs` / `Scheduled stop` / `Final stop` caption and the `stopMeta` style from timeline rows, keeping the departs/arrives accessibility label. Verify with an App test that none of those captions render on a route detail while stop names and times do, and that a row's accessibility label still contains "departs" or "arrives".
- [x] 1.3 Restyle `predictionSource` as a rounded, filled pill (`colors.mutedInk` background, `colors.surface` text, horizontal padding, `overflow: 'hidden'`) at the same absolute position, and give it a `testID`. Verify with a test that a scheduled tile renders the pill with a background color and that the existing "live and scheduled tiles line up" assertions still pass. Check light and dark on web.

## 2. Live route map

- [x] 2.1 Add a `color` prop to `LirrRouteMap` (native and web) and pass `route.color` from `RouteDetailView`. Use it for the polyline and stop outlines in place of `#A626AA`. Set the route badge over the map to `pointerEvents="none"`. Verify with `npm run typecheck` and a test asserting that the native polyline's `strokeColor` equals the route color.
- [x] 2.2 Native stop dots: render each station `Marker` with a centered custom white-circle child outlined in the route color, `anchor` at center, `title` set to the stop name, and `tracksViewChanges` that turns off after the first layout. Verify with a test that all 22 `lirr-stop-*` markers render the dot child with the route-color border and carry their stop titles.
- [ ] 2.3 Web stop dots: use a `SymbolPath.CIRCLE` icon (white fill, route-color stroke), a `title`, and an `InfoWindow` with the stop name on click that closes on map click. Add `gestureHandling: 'greedy'` to the web map options. Verify on web that the dots appear on the stations, clicking one shows its name, and drag/scroll-wheel pans and zooms the map.

- [x] 2.4 Replace the straight station-to-station line with real track geometry: generate `mobile/src/data/portJeffersonShape.ts` from GTFS shapes `91BE652D` + `DECD0CE9` (simplified to 4 m) and use it for the native and web polylines. Verify with a test that the native polyline's coordinates match the shape, which has many more points than there are stations.
- [x] 2.5 Replace default train pins with a rounded-square route-color badge with a white train glyph (a native custom view with the `rail` icon; a web SVG data-URL icon), so trains differ in shape from the stop dots. Verify with `npm run typecheck`, then check on web that no red pins remain.
- [x] 2.6 Give every prediction tile bottom padding so the Scheduled pill has clear space above it, and move the stop-row divider onto a wrapper spanning the name and the time. Verify with the updated "name and time only" test (the divider wrapper contains both) and on web.

- [ ] 2.7 Make train badges larger (34 pt square), and replace the web stop popup with a compact label that has no close button, so the close "x" can no longer cover the stop name. The label closes on a map click or by clicking another stop. Verify on web that the label shows the full stop name, and with `npm run typecheck`.

## 3. Interactive map area

- [x] 3.1 Add an `interactiveMap` prop to `mobile/src/components/DetailMapPage.tsx`. When set, the map container is `pointerEvents="auto"` and the scroll view is `pointerEvents="box-none"`; otherwise behavior is unchanged. Pass it from `RouteDetailView` only for the live route. Verify with tests that the live route's map container and scroll view have those values, and that an illustrated route and a trip detail keep `pointerEvents="none"` on the map.
- [ ] 3.2 Verify on web, and on a physical Android or iOS dev build if available, that dragging or pinching the uncovered map pans and zooms it, dragging the content scrolls the page over the map, and the back, location, favorite, and pin controls still respond. If Android pass-through fails, pause and update design.md with the fallback before continuing.

## 4. Integration check

- [ ] 4.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`. Then on web, open the Port Jefferson and S1 route details in light and dark themes and confirm every scenario in the change's `mobile-ui-design` delta.
