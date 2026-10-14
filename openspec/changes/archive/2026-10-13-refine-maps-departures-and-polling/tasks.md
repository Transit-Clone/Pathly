# Tasks

## 1. Home map

- [x] 1.1 Add a `recenterRequest` prop to `GoogleMapView.native.tsx` and `GoogleMapView.web.tsx`. The map recenters only when the prop changes and no longer reacts to `location` identity. The web user dot still follows `location`, and the `panBy` header offset is re-applied after each programmatic pan. In `HomeScreen.tsx`, increment the request on the first `located` fix and on each location-button press. Verify with an App test: after a mocked user pan, a new mocked GPS location does not call `animateToRegion` again, and pressing the location button does.
- [ ] 1.2 Restyle `search-center` as a solid `colors.searchCenter` dot: 17 pt, 3 pt white ring, shadow, no translucent fill. Verify with an App test that after a mocked region change the dot has width 17 and a `backgroundColor` equal to `searchCenter`. Check light and dark themes on web.

## 2. Backend departures

- [x] 2.1 In `firebase/functions/src/gtfsSchedule.ts`, raise `PREDICTIONS_PER_DIRECTION` to 6 and add an optional `limit` to `getStopPredictions`. The next-day lookahead triggers below `min(limit, 6)`. Verify with `npm run build` and a local script run at Stony Brook (LIRR 10) showing 6 entries per direction.
- [x] 2.2 Add a `getStopDepartures` callable in `index.ts` that returns one direction's merged live and scheduled departures with `limit` 200, covering the rest of today plus the next service day when fewer than 6 remain. Verify with `npm run build` and a local run listing the evening's westbound Stony Brook departures in ascending order.

## 3. Route-detail direction and departures

- [x] 3.1 In `RouteDetailView.tsx`, move the direction swipe onto the heading: a native paging `ScrollView` with one destination per page, and the web drag handlers on the heading wrapper. Put the page dots under the heading. Verify with App tests that swiping or scrolling the heading changes `route-detail-destination` and the dots, and that the tiles show the new direction.
- [x] 3.2 Replace the per-direction tile pages with one horizontal tile scroll for the active direction: up to 6 tiles, third-width, `snapToInterval`, web mouse drag-to-scroll, and a reset to x = 0 on direction change. Tapping a tile still selects its trip. Verify with App tests that 6 mocked predictions render 6 tiles, that a 7th is not rendered, and that scrolling the tiles does not change the heading.
- [x] 3.3 Add the `route-more-departures` card after the tiles. It shows whenever the direction has departure data. Verify with an App test that it is the last item when 6 tiles are shown, and that it is also present with 2 tiles.
- [x] 3.4 Add `fetchStopDepartures` to `transitLive.ts` and a new `DeparturesView.tsx`: route badge, destination, and stop name; rows with clock time, minutes, and live/scheduled marking; loading and unavailable states. Add a `departures` `ActiveView` in `HomeScreen.tsx`, with back (and Android back) returning to the route on the same direction through an `initialDirectionIndex` prop. Verify with App tests that tapping More opens a page listing the mocked departures with clock times, that a rejected call shows "Departures unavailable", and that back restores the second direction.

## 4. Route map

- [x] 4.1 In `RouteMap.native.tsx` and `.web.tsx`, split the line at the path point nearest `focusStop` (searching only between its neighboring stops): a faded segment behind (~35% opacity) and full strength ahead. Keep a single full line when there is no focus stop. Add a pure helper (for example in `mapGeometry.ts`) for the split index and bearing. Verify with `mapGeometry` unit tests (split index on a straight path; bearing east vs. west) and an App test that the native map renders two `route-line` polylines with the faded one using the alpha color.
- [x] 4.2 Draw the direction arrow beside the focus stop, pointing toward the next stop: a native rotated chevron `Marker` (`flat`) and a web `FORWARD_CLOSED_ARROW` symbol rotated to the bearing. Verify with an App test that `route-direction-arrow` exists with the westbound rotation for Stony Brook, flips after switching direction, and is absent with no focus stop.
- [ ] 4.3 Restyle the vehicle markers on native and web: 42 pt borderless white circle, stronger shadow, larger glyph, and a borderless route-color age badge. Verify with an App test that the vehicle badge has width 42, `borderWidth` 0 (or unset), and a white background, and that the age badge has no border. Check both themes on web. This supersedes `refine-route-detail-and-nearby` task 5b.1.
- [x] 4.4 Add a `badgeLabel()` helper (short name ≤ 4 characters, LIRR branch codes such as `PJ`, otherwise initials) and render the map badge compact with the mode icon just below the back button, inside the `pointerEvents="none"` overlay. Verify with unit tests for `badgeLabel` (a discovered "Port Jefferson Branch" gives `PJ`, `51` gives `51`) and an App test that `route-detail-badge` shows `PJ`, not "Port Jefferson".

## 5. Transfers sheet

- [x] 5.1 Make the `+N` transfer count a button that opens a modal sheet titled with the station name, listing every transfer grouped under Rail, Subway, and Bus, and closing by its button, a backdrop tap, or `onRequestClose`. Verify with App tests that tapping `stop-transfers-more-Jamaica` shows every Jamaica transfer, including the hidden ones, under the mode headings, and that the close button dismisses it.

## 6. Visible-only polling

- [x] 6.1 Give `TransitLiveProvider` an `activeRouteIds` prop. Poll only active routes every 15 s, fetch newly active routes immediately (unless fetched in the last 5 s), keep inactive routes' last data, and stop always polling `STATIC_LIVE_ROUTES`. Verify with an App test that with 10 mocked nearby routes and 3 active, `getRouteLiveStatus` is called for exactly those 3, and that adding a 4th id triggers one more call without re-calling the other 3.
- [x] 6.2 Have `TransitSheet.tsx` report visible card route ids for the active tab (from card `onLayout` and a throttled scroll listener), and have `HomeScreen.tsx` pass `activeRouteIds`: visible cards on home, the open route on route and departures views, nothing otherwise. Verify with App tests that scrolling the mocked sheet changes the reported ids, and that opening a route limits calls to that route.

## 7. Integration check

- [ ] 7.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`, and `npm run build` in `firebase/functions`. The user deploys functions. On web, in light and dark themes, check:
  - the home map stays put after panning, and the solid purple dot shows;
  - the heading swipe and the tile scroll work independently, the More page works, and back returns to the same direction;
  - the faded line and the arrow show at the nearest stop;
  - vehicle markers and the badge look right;
  - the `+N` sheet opens;
  - the network tab shows live calls only for visible routes.

  On a device, if available, also confirm that a vertical drag starting on the tiles still scrolls the page.
