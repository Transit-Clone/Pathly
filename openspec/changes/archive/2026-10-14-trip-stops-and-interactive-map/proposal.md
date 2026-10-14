# Proposal

## Why

A planned trip says "Ride 14 stops" but never names them, so a rider can't check where they are or tell when their stop is coming up. The trip maps are also frozen pictures: riders can't zoom in to see a transfer, or find where the stops in between are. Google's Routes API only returns a stop *count* for each leg, but Pathly already has the stops and timetables for the subway, LIRR, NICE, and Suffolk in its own GTFS data, so it can fill in the rest.

## What Changes

- **Stops in between, on Trip Details.**
  - Each transit leg card gets a "14 stops" control that expands into the full list of stops it passes, each with its scheduled time, between the boarding and alighting rows. The list starts collapsed.
  - The stops come from Pathly's own GTFS timetables. `planTrip` matches each Google transit leg to a scheduled GTFS trip on the backend, using the stops nearest the boarding and alighting points and the departure time, and adds the stops in between to the response.
  - When a leg can't be matched (an agency Pathly has no GTFS data for yet, such as MTA buses until they're added, or a trip missing from the timetable), the card keeps today's "N stops" text without a list. No stops are invented.
- **Interactive trip maps.**
  - The Trip Details map and the map behind Route Results respond to gestures where they aren't covered by content: drag to pan, pinch (or scroll wheel and trackpad on web) to zoom. Scrolling the content still scrolls the page, as on the live route map.
  - Each transit leg shows a small marker at every stop in between, in the line's color, when the leg has matched stops.
  - Tapping a stop marker shows its name and scheduled time.
  - Tapping a stop row in Trip Details centers the map on that stop and highlights it.
  - A control re-frames the map to the whole trip after the rider has moved it.

### Not in this change
- Live (GTFS-RT) predictions for the stops in between, and alerts for "your stop is next".
- Stop lists for agencies without GTFS data in Pathly (MTA buses and NYC Ferry arrive with `mta-bus-and-ferry`, and their legs then match automatically).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Modified:** "Real transit trip planning" (transit steps can include their intermediate stops with scheduled times, from Pathly's timetables).
- `mobile-ui-design`:
  - **Modified:** "Consistent trip-detail presentation" (an expandable list of the stops in between on each leg).
  - **Modified:** "Trip map shows the real path" (intermediate stop markers; the map is interactive).
  - **Modified:** "Stationary detail map backdrop" (trip-detail maps respond to gestures like the live route map).
  - **Added:** "Trip map stops are explorable" (tapping markers and stop rows).

## Impact

- **Order:** builds on `real-trip-planning`, whose added requirements ("Real transit trip planning", "Trip map shows the real path") this change modifies. Archive `real-trip-planning` before archiving this one.
- **Backend (`firebase/functions`):**
  - New `src/tripStops.ts`: matches a transit step to a GTFS trip and returns the stops in between. It uses the existing `loadAgencyStaticData`, `loadGlobalStopRouteIndex`, `loadRouteStopTimes`, and `isServiceRunningOn`.
  - `planTrip` enriches each transit step before responding. The response grows by about 50 bytes per intermediate stop.
  - New tests against the recorded Routes fixtures and the checked-in GTFS data.
- **Mobile (`mobile/src`):**
  - `data/tripPlanning.ts`: `TransitStep` gains optional `stops`.
  - `SharedTripDetailView` / `PlannedTripDetailView`: an expandable stop list per leg.
  - `TripMap.web.tsx` / `TripMap.native.tsx` and `data/tripMap.ts`: gestures, intermediate markers, tap-to-inspect, focus on a stop, and a re-frame control.
  - `DetailMapPage` and `RouteResultsView`: let the uncovered map take gestures (the pattern the live route map already uses).
- **No new Google cost:** the stops come from Pathly's own data, and Routes requests are unchanged.
- **Requires redeploying functions.**
