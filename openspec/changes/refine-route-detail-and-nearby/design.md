# Design

## Context

Observed in code:
- **Bounce to Home:** `HomeScreen` sets `nearbyStatus` to `loading` on every location change (`HomeScreen.tsx:110`). `useCurrentLocation` watches location every ~10 s or 25 m, so `allDiscoveredRoutes` briefly empties. `findRoute(routeId)` then fails and the route view calls `showHome()` during render (`:312`).
- **Single tile:** `gtfsSchedule.getStopPredictions` merges live entries with a timetable fallback only when `supportsStaticFallback` is set: LIRR and Suffolk yes, subway and NICE no. It also only covers the rest of today, and `PREDICTIONS_PER_DIRECTION = 3`. A route with one tracked vehicle returns one entry, and the flex tile fills the row.
- **Waterfall:** for each live route, `TransitLiveContext` awaits `getNearestRouteStop`, then `getRouteLiveStatus` (two sequential calls). Route detail waits for live status before its own `getRouteGeometry` call. The server parses large `stop_times.txt` files on cold start.
- **Labels:** directions come from `directions[i].direction` ("Westbound to Penn Station", "Toward X"), and cards title with `route.routeName`.
- **Fare:** a `lirrFares` row on route detail. **Pin and favorite** are separate state lists (`pinnedRouteIds`, `favoriteRouteIds`), and `DEFAULT_PINNED_ROUTE_IDS = ['ronkonkoma']`.
- **Shapes:** `shapes.txt` exists for every agency, but `gtfsStaticData` doesn't read `shape_id`. `getRouteGeometry` chains the longest trip with complementary trips (as for Port Jefferson's Huntington split) but returns only stops.

## Goals / Non-Goals

**Goals:**
- Honest, readable times.
- One clear save model.
- Real geometry everywhere.
- A useful Nearby list anywhere.
- A noticeably faster first paint.
- A stable route view.

**Non-Goals:**
- Real service alerts.
- Server-side transfers for all routes. Transfers remain the generated Port Jefferson data, now filtered by mode.
- Persisting saved routes beyond the session.
- `minInstances` or other paid warm-instance settings. Those are a cost decision to raise with the team, not part of this change.

## Decisions

1. **Stable route view.**
   - `nearbyStatus` keeps the previous route list while re-fetching (`refreshing` instead of `loading` once something has loaded).
   - `activeView` for a route stores the opened `RouteDetail` snapshot, so the screen never depends on the route still being in the nearby list. Live data still updates through `useTransitLive(route.id)`, because `TransitLiveProvider.extraRoutes` includes the open route explicitly.
   - The render-time `showHome()` is removed.
2. **Tiles.**
   - *Server:* `supportsStaticFallback: true` for all agencies. Subway and NICE static stop_times use directional stop IDs, so the fallback looks up `direction1StopId` and `direction0StopId` separately when `directionalStops` is set. The lookahead continues into the next service day (times plus 24 h) until each direction has 3 entries.
   - *Dedup:* subway and NICE realtime trip IDs don't match their static ones (why the fallback was originally off), so the `supportsStaticFallback` flag became `realtimeTripIdsMatchStatic`. When it's false, the timetable only adds departures after the last live one, so a tracked trip is never listed twice.
   - *Terminal fix (found while verifying):* at stops that serve both directions with one `stop_id` (NICE's Mineola terminal), direction was decided by stop ID, which put everything in one direction. When `direction1StopId === direction0StopId`, the trip's `direction_id` now decides, for both live and timetable entries.
   - *Client:* tiles use `flexBasis: 0, flexGrow: 0, width: '31%'`, three per row.
   - `predictionTiming`:
     - `minutes <= 0` (but not yet past) → `0` with the `minutes` label;
     - `minutes >= 60` → `formatClockTime(nowMinutes + minutes)`, split into the value (`5:00`) and the unit (`PM`).
   - Negative entries can appear between polls as time passes. They're dropped on the client by recomputing each entry's minutes from the poll timestamp (`fetchedAt`), and tiles re-render on a 30 s tick.
   - The same helper is used by `TransitCard`.
3. **Scheduled look.** `scheduled` opacity drops from 0.68 to 0.45. The pill gets its own opacity compensation (it's rendered inside the faded tile, so it uses an opaque `colors.mutedInk` fill already); its contrast is verified against the faded tile in both themes. Tile `borderWidth` goes from 2 to 3. *Found while testing:* the tiles became `PressableScale` buttons, and `PressableScale` set its own `opacity` (1 at rest), overriding the tile's faded style, so scheduled tiles weren't faded at all. It now scales the caller's own opacity (`[base, base × 0.78]`) instead of replacing it.
4. **Destination labels.**
   - A shared `directionDestination(direction)` helper strips a leading `(Westbound|Eastbound|Northbound|Southbound|Uptown|Downtown|Inbound|Outbound)? (to|toward)` and a bare leading `Toward`.
   - `nearbyTransit.discoveredRouteToRouteDetail` sets `direction` to the headsign alone. It's used by the route title, the page-dot labels, and the cards.
5. **Card title.** `route.shortName || route.routeName`. The accessibility label keeps the agency and full name.
6. **Save star.**
   - `pinnedRouteIds` and `favoriteRouteIds` merge into `savedRouteIds` (session state), shown in Nearby's leading section and in Favorites → Routes.
   - The route-detail pin button is removed and the star toggles saved. The card's thumbtack marker becomes a small filled star.
   - `DEFAULT_PINNED_ROUTE_IDS` is deleted, so nothing is saved by default. Trip favorites are unchanged.
7. **No fare row.** The route-detail fare block and its `realFareForRoute` call are removed. `lirrFares` stays for trip cards, which still use it.
8. **Shapes from the backend.**
   - `gtfsStaticData` keeps `shapeId` per trip and lazily loads `shapes.txt` per agency into a `shapeId → points` map, cached per instance.
   - `getRouteGeometry` builds `path` from the shapes of the trips it chained. Each shape is trimmed to the stretch between its trip's first and last stop (nearest shape points), then the pieces are concatenated and simplified server-side (Douglas-Peucker, about 4 m) to keep payloads small.
   - The client `RouteGeometry` gains `path?`, and `RouteMap` uses `geometry.path ?? stops`. `portJeffersonShape.ts` and its import are deleted.
9. **Transfers filter.** `transfersFor(route, stop)` drops entries whose agency **and** mode match the viewed route's: LIRR rail on an LIRR route, subway on a subway route, buses of the same agency on a bus route.
10. **Center search.**
    - `GoogleMapView` reports `onRegionChangeComplete(center)` after user gestures (native `onRegionChangeComplete` filtered by a user-pan flag; web `onIdle` after `onDragStart`).
    - HomeScreen keeps `searchCenter` (null means the rider's location). When it's set, a purple 28 pt ring with a translucent fill is drawn as an overlay fixed at the visible map center (above the sheet's resting top). Nearby discovery uses `searchCenter ?? location`, debounced by 600 ms.
    - The location button clears `searchCenter`. Live predictions still use the rider's real location for nearest stops.
    - Purple is a new palette token, `searchCenter` (#7C3AED light / #A78BFA dark).
11. **Adaptive radius.**
    - `findNearbyTransit` keeps per-agency base radii (subway 1.6 km, bus 2.4 km, LIRR 8 km) and runs widening passes at 1×, 2×, 4× and 8× the base, capped at subway 6 km, bus 12 km and LIRR 30 km.
    - It stops at the first pass that yields ≥ 8 distinct routes across agencies. Each pass reuses the already-fetched candidate stops (`CANDIDATE_STOPS_PER_AGENCY` grows to 400 so the widest pass has candidates).
    - Results stay sorted by distance and are capped at 30 routes.
    - *Cold-start fix (found while measuring):* `loadRouteStopTimes` streamed the agency's entire `stop_times.txt` once per route, so a cold Midtown search (30 routes over the 35 MB subway file) took about 110 s. Routes requested in the same tick are now batched into one streaming pass per agency, which keeps only those routes' rows. Measured cold searches drop from 27–112 s to 14–17 s; warm searches take 20–150 ms.
12. **One call per route.**
    - `getRouteLiveStatus` accepts optional `lat`/`lon`. When given, it resolves the nearest stop per direction server-side (reusing `getNearestStopForRoute`) and returns `nearestStop` alongside the departures.
    - `TransitLiveContext` makes one call per route and updates each route's status as soon as its call resolves (per-route `setLiveStatus`, not after `Promise.all`).
    - Route detail starts `fetchRouteGeometry` on mount for both directions, without waiting for live status.
    - The old `getNearestRouteStop` callable is kept for backwards compatibility but no longer used by the app.

13. **Inverted vehicle markers.**
    - *Native:* `vehicleBadge` changes from a route-color rounded square with a white border to a white circle with a route-color border (3 pt), with the glyph in `color`. `ageBadge` changes to `backgroundColor: color` / `borderColor: #FFF`, with white `ageText`.
    - *Web:* `vehicleIconUrl` inverts the same fills in the SVG: the circle is white with a route-color stroke, the glyph is drawn in route color (window cut-outs in white), and the badge circle is route-color with a white stroke and white text.
    - A drop shadow (native `elevation`/`shadow*`, SVG filter on web) keeps the white circle visible on light map tiles.
    - *Shape:* the marker is a circle rather than a rounded square (`borderRadius: VEHICLE_SIZE / 2` natively, `<circle>` in the SVG). It's kept apart from the 14 pt stop dots by size (34 pt), the mode glyph, and a higher `zIndex`.
    - This supersedes `refine-route-detail-ui`'s "route-color badge with white glyph" wording, which is archived first; see Migration Plan.

## Risks / Trade-offs

- [Requires redeploying functions] → The client tolerates an older backend: it falls back to the stop-joined line when `path` is missing and to the separate nearest-stop call when `nearestStop` is missing.
- [Parsing every agency's `shapes.txt`] → Shapes are loaded lazily per agency only when geometry is requested, and cached per instance. Subway shapes are the largest and load on the first subway route only.
- [A wider radius can include far-away LIRR stations] → Results are capped at 30 and sorted by distance, and the LIRR cap is 30 km.
- [Clock-time values need a separate unit (AM/PM) in the small label slot] → The tile layout is unchanged, so alignment stays the same.
- [Merging pin and favorite drops the "pinned but not favorite" distinction] → This is the intended simplification.

## Migration Plan

Deploy the functions first (backwards compatible), then ship the app. Tests and fixtures move from `route-pin` to the star control.
