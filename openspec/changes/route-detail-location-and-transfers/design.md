# Design

## Context

- HomeScreen owns `useCurrentLocation()` (`location`, `refresh`) and already derives `liveStop` from it.
- The home `CurrentLocationButton` calls `refresh()` and sets a selected flag that `onUserPan` clears.
- On route detail, the `route-location` button only sets `isLocationCentered`. `LirrRouteMap` has no user marker (native `showsUserLocation` is off; web has none).
- The timeline is `scheduleStopsFromNow(stopsForDirection(...), now, lead − anchorOffset)` over the whole line.
- LIRR `transfers.txt` only covers LIRR-to-LIRR transfers at the same stop. There was no bus or subway data in the repo.

## Goals / Non-Goals

**Goals:** location parity with home on the live map, a rider-relative timeline, and accurate and refreshable transfer data.

**Non-Goals:**
- Transfer departure times.
- Tapping a chip to open that line.
- Amtrak, NJ Transit, or PATH.
- Transfers or rider location for illustrated maps (those already draw a mock location dot).

## Decisions

1. **Location flows from HomeScreen.** `RouteDetailScreen` passes `location` and `onRefreshLocation` to `RouteDetailView` and on to `LirrRouteMap` as `userLocation`, plus a `centerOnUserRequest` counter.
   - Pressing the button calls `refresh()`, increments the counter, and sets `isLocationCentered`. The map centers on the current `userLocation` whenever the counter changes, and again when `userLocation` changes while a center request is active, so a fresh GPS fix lands where expected.
   - `onUserPan` (native `onPanDrag`, web `onDragStart`) clears the selected state.
   - Centering also counts as the rider moving the map, so the nearest-station focus no longer snaps back.
2. **Rider marker.**
   - *Native:* `showsUserLocation` (the platform blue dot).
   - *Web:* a 16 px blue dot with a white ring, matching the home web map's marker. It's a `SymbolPath.CIRCLE` marker, so it needs no `mapId`.
   - Without permission, `useCurrentLocation` keeps its fallback point, which is not the rider. A `locationKnown` flag hides the web marker and skips centering in that case. Native's platform dot already shows nothing without permission.
   - `useCurrentLocation` gains `known: boolean` for this.
3. **Timeline slice.**
   - For live routes, find `liveStop` in the direction-ordered list and slice from there to the end, rebasing offsets so the first row is 0.
   - Then `scheduleStopsFromNow(slice, now, lead)`. The nearest station is the first row and "departs" now + lead, which replaces the anchor-offset approach from `live-trains-and-nearest-stop`.
   - Non-live routes are unchanged.
4. **Transfer data.**
   - `scripts/generate_station_transfers.py` (standard library only) downloads the six official feeds, or reuses them with `--feeds-dir`.
   - For each station it collects routes with any stop within 400 m (via `stop_times` and `trips`) and LIRR branches calling at the same `stop_id`. It excludes route 10 and LIRR's "City Terminal Zone" grouping.
   - It writes `stationTransfers.ts` with agency, mode, short name, and route and text colors, sorted rail → subway → bus and then naturally by name.
   - 400 m catches the A/C/E and 1/2/3 entrances at Penn Station but not Herald Square.
   - *Alternative:* a hand-curated list, which couldn't be verified and would go stale.
5. **Chips.**
   - Subway chips are circles. Rail and bus chips are rounded rectangles.
   - The fill is the route color (or a muted surface with ink text when the feed has none), and the text uses the feed's text color.
   - At most eight chips are shown, then a `+N` text. The row's accessibility label appends "transfers: …" with every name.

## Risks / Trade-offs

- [Feeds change a few times a year] → Re-run the script. The header comment says how.
- [400 m can include a stop that is technically close but across a highway] → This is acceptable for a prototype, and the radius is one constant.
- [Busy stations such as Jamaica and Penn have 20+ transfers] → The cap of eight plus `+N` keeps rows readable.
