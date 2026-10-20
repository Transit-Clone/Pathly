# Design

## Context

- **What Google gives:** each Routes API transit step has the boarding and alighting stop (name, location, and time), the line, the headsign, and `stopCount`. It has no list of the stops in between. `normalizeRoutesResponse` in `firebase/functions/src/tripPlanning.ts` turns this into `TransitStep { from, to, stopCount, path, … }`.
- **What Pathly already has:** GTFS static data for four agencies (`lirr`, `subway`, `nice`, `suffolk` in `gtfsAgencies.ts`), loaded with these helpers in `gtfsStaticData.ts`:
  - `loadAgencyStaticData(agency)` gives `stopsById`, `routesById`, `tripsById`, and the calendars;
  - `loadGlobalStopRouteIndex(agency)` maps each stop to the routes serving it;
  - `loadRouteStopTimes(agency, routeId)` gives one route's `byTrip`/`byStop` stop times, read lazily from the prepared files under `derived/stop_times/` and cached;
  - `isServiceRunningOn(agency, serviceId, dateKey, dayOfWeek)` says whether a service runs on a given day.
- **Stop IDs:** the subway, NICE, and Suffolk use different stop IDs for each direction (`directionalStops: true`). The LIRR doesn't.
- **Maps today:**
  - `TripMap.native.tsx` turns off `scrollEnabled` and `zoomEnabled`, and `TripMap.web.tsx` uses `gestureHandling: 'none'`.
  - `DetailMapPage` already supports `interactiveMap`, which the live route map uses: the map takes `pointerEvents='auto'`, and the scroll view becomes `box-none` over the map window.
  - `RouteResultsView` draws `TripMap` behind its list.
- **Fare estimator precedent:** `createFareEstimator(loadAgencyStaticData('lirr').stopsById.values())` already matches Google stops to GTFS stops by distance (within 400 m), because the stop names differ.

## Goals / Non-Goals

**Goals:**
- Real stop names and scheduled times between boarding and alighting, for every leg Pathly has a timetable for.
- Never show a wrong list. When the match is unclear, show no list.
- Trip maps riders can explore, consistent with the live route map's gesture model.

**Non-Goals:**
- Live predictions for intermediate stops.
- Arrival notifications.
- Stops for agencies without GTFS data in Pathly.

## Decisions

### 1. Match on the backend, inside `planTrip`
- **Why server-side:** the GTFS data, its indexes, and the warmed caches live in Functions. The client never sees the timetables, and adding this to `planTrip` costs no extra round trip.
- **Where:** a new `src/tripStops.ts` exports `createStopMatcher()`. It returns an async `(step) => TripStop[] | undefined`, which `planTrip` runs over every transit step of every itinerary after normalization, in parallel, under a total **1.5 s budget**. A step that isn't done in time keeps no stops, so the trip still returns on time.
- **Alternative considered:** a separate `getTripStops` callable, called when a leg is expanded. Rejected: it adds a request and a loading state per expand, and the map wants the stop markers when the trip opens.

### 2. Agency from Google's agency name
- The mapping is a small table:
  - `Long Island Rail Road` → `lirr`;
  - `MTA New York City Transit` with mode `subway` → `subway`;
  - `Nassau Inter-County Express` → `nice`;
  - `Suffolk County Transit` and `Suffolk County Transit - …` → `suffolk`. This reuses `tripFares.ts`'s `isSuffolk`, moved to a shared helper.
- An unknown agency gets no match. This is how MTA buses and ferries behave until `mta-bus-and-ferry` adds their data and table rows.

### 3. Matching a step to one scheduled trip
1. **Candidate stops:** GTFS stops within **250 m** of Google's boarding point, and separately of its alighting point, taking the nearest 4 of each. For agencies with directional stops, every child stop of a matched parent station is included.
2. **Candidate routes:** routes in `loadGlobalStopRouteIndex` that serve at least one boarding candidate **and** one alighting candidate.
3. **Candidate trips:** for each candidate route, `loadRouteStopTimes(...).byTrip`. A trip qualifies when:
   - its service runs on the trip's service day: the New York calendar date of the departure, and also the previous date for GTFS times of 24:00 or later;
   - it stops at a boarding candidate whose scheduled departure is within **±2 min** of Google's departure;
   - it stops at an alighting candidate **later** in the trip.
4. **Pick:**
   - Exactly one qualifying trip → its stop times strictly between the two stops become the step's `stops` (name, location, and time as ISO in America/New_York).
   - Several, which happens for duplicated trips or overlapping services → the one closest in time, and only if the next best is more than 60 s further off. Otherwise no stops.
   - None → no stops.
5. **Sanity check:** if the matched count differs from `stopCount - 1` by more than 1, the match is dropped. Google's `stopCount` counts the alighting stop. The tolerance allows for a request-stop or flag-stop difference.
- **Why the time window and not the headsign:** Google's headsigns and the GTFS headsigns are worded differently, but departure times both come from the agencies' published schedules.

### 4. Response shape
- `TransitStep` gains optional `stops?: { name: string; location: LatLng; time: string }[]`, mirrored in `mobile/src/data/tripPlanning.ts`.
- Older clients ignore the field.
- The session cache key is unchanged, because the stops depend only on the step.

### 5. Trip Details stop list
- `TripDetailLeg` gains `stops?: { name; time }[]`.
- When the list isn't empty, the leg card's "N stops" becomes a `PressableScale` with `accessibilityState={{ expanded }}` and a chevron. Expanding uses the existing `useLayoutEase()` and inserts the rows between BOARD AT and GET OFF.
- Each row shows a small dot in the line color, the stop name, and its time. Pressing a row calls `onFocusStop(point)`.
- With no stops, the count stays plain text, as today.

### 6. Interactive `TripMap`
- **Native:** `scrollEnabled` and `zoomEnabled` are on. `PlannedTripDetailView` passes `interactiveMap` to `DetailMapPage` through `SharedTripDetailView`. `RouteResultsView` wraps its map so that the area above the results sheet is `pointerEvents='auto'`, the same pattern as the home map.
- **Web:** `gestureHandling: 'greedy'`, as in `RouteMap.web.tsx`, applied only where the map isn't covered, which the pointer-events layering already ensures.
- **Intermediate markers:** `tripMapPoints` gets a `kind: 'via'` stop for each intermediate stop, drawn as a 7 px dot in the line color with a white outline. The boarding, alighting, start, and end markers keep their size.
- **Tap to inspect:**
  - Each marker is pressable (`Marker.onPress` on native, a marker click listener on web) and sets `selectedStop`.
  - The label is an overlay callout (`Callout` on native, an `OverlayView`-style positioned div on web) with "Mineola · 9:14 AM". Native's default info window can't be themed.
  - A map tap clears it.
- **Focus from the list:** `TripMap` takes `focusStop?: { point; key }` and animates the camera to it (`animateCamera` on native, `panTo` with zoom 15 on web), then selects it.
- **Re-frame control:** a `MapControl` with the `route` icon, shown once the camera has moved from the fitted frame. It refits to the trip's bounds.

## Risks / Trade-offs

- [Wrong stop list from an ambiguous match] → The match needs exactly one trip within ±2 min (or a clear winner), and a stop-count sanity check. When unsure, there's no list, never a guess. Tests cover a deliberately ambiguous case.
- [Latency: loading a route's stop times cold can take a few hundred ms] → Matching runs in parallel under a 1.5 s budget. The route files are cached in memory after the first load, and the backend warm-up already loads the hot routes.
- [Google and GTFS stops sit apart, for example a subway entrance versus the platform centroid] → A 250 m radius plus parent-station expansion. The LIRR's non-directional stops make it the easy case.
- [Schedule drift: Google's schedule is a different feed version than Pathly's prepared data] → The ±2 min window absorbs small changes. The daily GTFS update keeps Pathly current.
- [Gesture conflict between the map and page scroll] → The same `box-none` layering as the live route map, which is already tested ("lets only the live route map take gestures through the scrolling page").

## Migration Plan

1. Deploy the functions. The new optional field is backward compatible.
2. Ship the client. Older responses without `stops` render as today.
3. Rollback: revert the functions. Clients then just stop seeing lists.

## Open Questions

- Should a leg card show a "next stop" highlight while the trip is in progress? That needs location tracking during a trip, so it's left to a later turn-by-turn change.
