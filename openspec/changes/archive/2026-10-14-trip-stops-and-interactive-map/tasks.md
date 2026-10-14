# Tasks

## 1. Backend: intermediate stops

- [x] 1.1 Add `src/tripStops.ts`:
  - the agency table (design decision 2), with `isSuffolk` moved to a shared helper that `tripFares.ts` also uses;
  - `createStopMatcher()`: candidate stops within 250 m (nearest 4, with parent-station expansion), candidate routes from `loadGlobalStopRouteIndex`, candidate trips from `loadRouteStopTimes` running on the service day (including the previous day for 24:00+ times), the ±2 min departure window, the alighting stop later in the trip, the single-winner rule, and the stop-count sanity check.

  Verify with `test/tripStops.test.js`, using the checked-in GTFS data and the recorded Routes fixtures:
  - the LIRR legs in `routes-sbu-penn.json` get stop lists whose length is `stopCount - 1` and whose times fall between boarding and alighting;
  - a step on an unknown agency gets none;
  - a departure time shifted by 10 min gets none;
  - two equally close trips get none;
  - a 24:00+ GTFS time matches the previous service day.
- [x] 1.2 Add `stops?` to `TransitStep` in `tripPlanning.ts`, and run the matcher in `planTrip` over all transit steps in parallel under a 1.5 s budget. Verify with `test/planTrip.test.js`: the fixture response includes stops for the LIRR legs, and a stubbed slow matcher returns itineraries without stops within the budget. Run `npm test` and `npm run build` in `firebase/functions`.

## 2. Client: stop list

- [x] 2.1 Mirror `stops?` in `mobile/src/data/tripPlanning.ts`, and add stops to the `planTrip` mock fixture in `jest.setup.js`.
- [x] 2.2 In `SharedTripDetailView` and `PlannedTripDetailView`, make "N stops" an expandable control when a leg has stops: the chevron, `accessibilityState.expanded`, rows with a dot, name, and time between BOARD AT and GET OFF, and `onFocusStop` on row press. With no stops, keep plain text. Verify with App tests: the list starts collapsed, expands to the fixture's stops in order with their times, and collapses again; a leg without stops has no control.

## 3. Client: interactive map

- [x] 3.1 In `data/tripMap.ts`, add `via` stops for intermediate stops. In `TripMap.native.tsx` and `TripMap.web.tsx`:
  - turn on gestures (native `scrollEnabled`/`zoomEnabled`; web `gestureHandling: 'greedy'`);
  - draw the via markers;
  - add tap-to-select with a themed label;
  - clear the selection on a map tap;
  - add a `focusStop` prop that animates the camera to a stop and selects it;
  - add a re-frame control shown after the camera moves.

  Verify with App tests on the native mock: one via marker per intermediate stop in the line color; pressing a marker shows "name · time"; `focusStop` triggers `animateCamera`.
- [x] 3.2 Pass `interactiveMap` through `SharedTripDetailView` to `DetailMapPage` for planned trips, and make the uncovered Route Results map take gestures. Update the existing pointer-events test. Verify with App tests: `search-trip-map` has `pointerEvents='auto'`, the scroll view is `box-none` over the map window, and the controls still respond to presses.

## 4. Integration check

- [ ] 4.1 Run `npm test` and `npm run build` in `firebase/functions`, and `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`. After the functions are deployed, plan Stony Brook University → Penn Station on web at phone width:
  - expand the LIRR leg and compare its stops and times against the LIRR timetable;
  - tap a listed stop and see the map center on it;
  - pinch and drag the map without the page scrolling;
  - tap a via marker;
  - re-frame.

  Repeat in dark mode, and on Android or iOS through Expo Go.
