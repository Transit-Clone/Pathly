# Design

## Context

- `LirrLiveProvider` (wrapping every HomeScreen view) polls `getLirrBranchLiveStatus({ routeId: '10', stopId: '14' })` every 30 s. Stop `14` is Stony Brook.
- The function already returns predictions for any `stopId`, and it filters vehicles to the route. It doesn't return vehicle timestamps, although the MTA feed has them as protobuf `Long`s on every vehicle.
- In a live sample of 97 vehicles, all had timestamps, and some were 11–20 h old (parked or finished trips).
- `RouteDetail.liveSource.direction1Index` maps GTFS `direction_id` 1 to a `directions` index.
- HomeScreen already calls `useCurrentLocation()`, which falls back to a Stony Brook–area point when permission is denied.

## Goals / Non-Goals

**Goals:** honest per-train freshness, a less cluttered map, and a route view that starts where the rider is.

**Non-Goals:**
- Nearest-stop logic for routes without live data.
- Choosing a different station by hand.
- Push or streaming updates.

## Decisions

1. **Timestamp on the server.** `lirrStatus.ts` adds `timestamp: number | null` (epoch seconds, `Number(String(vehicle.timestamp))` to unwrap `Long`) to each vehicle. The client maps it to `updatedAt` in ms. Trains without a timestamp (an old deployed function) are kept and show no badge, so the app works before the redeploy.
   - **Direction fix found while sampling:** the feed never sets `direction_id` on vehicle positions, and protobufjs reports a missing field as `0`, so `vehicle.trip.directionId ?? tripsMeta.directionId` labeled every train "direction 0" (5 of 15 Port Jefferson trains were wrong in a sample). Vehicles now take their direction from `trips.txt`. Trip updates do carry the field and are unchanged.
2. **Stale cutoff on the client.** Trains whose `updatedAt` is more than 5 minutes old are filtered out in the map component, using the same 1 s clock as the badge. That way a train also disappears if it goes stale between polls.
3. **Poll every 15 s.** `POLL_INTERVAL_MS = 15_000`. The LIRR feed header was 5 s old when sampled, so 15 s shows real movement without hammering the function.
4. **Age badge.**
   - A `useNow(1000)` tick in `LirrRouteMap` re-renders every second, with `formatAge(seconds)` returning `Ns` / `Nm` / `Nh`.
   - *Native:* the train marker is a custom view (34 pt route-color rounded square with a train glyph) with an absolutely positioned 20 pt white circle badge at its top-right. Its `tracksViewChanges` stays on for train markers only (a handful), so the ticking text renders. Stop markers keep tracking off.
   - *Web:* the marker icon is an SVG data URL regenerated per tick, with the badge circle and age text drawn in the SVG, anchored at the square's center.
5. **Direction filter.** `RouteDetailView` computes `gtfsDirection = activeDirectionIndex === liveSource.direction1Index ? 1 : 0` and passes it to `LirrRouteMap`, which filters `vehicles` by `directionId`.
6. **Nearest station.**
   - `PORT_JEFFERSON_STOPS` gains each station's GTFS `stopId` (from `stops.txt`).
   - `nearestStop(location, stops)` uses an equirectangular distance, which is accurate enough over 100 km to rank stations.
   - HomeScreen computes it from `useCurrentLocation()` and passes its `stopId` to `LirrLiveProvider` (replacing the fixed `liveSource.stopId`, which stays as the fallback), and passes the stop to `RouteDetailScreen` → `RouteDetailView` → `LirrRouteMap` as `focusStop`.
7. **Map focus.**
   - *Native:* `initialRegion` is centered on `focusStop` with a ~0.06° span. When `focusStop` changes and the rider hasn't panned (`onPanDrag` sets a flag), `animateToRegion`.
   - *Web:* `center` is memoized on the focus stop's name, `zoom` is 13, and the center stops following after `onDragStart`.
   - The focused stop's dot is larger (20 pt) and filled with the route color.
8. **Timeline anchor.** `scheduleStopsFromNow` stays as is. RouteDetailView passes `leadMinutes − offset(nearest stop in this direction)`, so the nearest station's time equals now plus the first prediction. Earlier stations show earlier times, which is correct for a train that already passed them.

## Risks / Trade-offs

- [The function must be redeployed for the age badge and stale filtering] → Old payloads degrade gracefully (no badge, nothing hidden). The deploy command is in tasks.
- [GPS position changes slightly while the app is open] → The nearest station only changes when another station becomes closer. The poll restarts with the new `stopId`, and the provider shows the previous data until the new data arrives.
- [The 1 s re-render of the train markers on native] → Limited to a few markers. Stop markers don't track view changes.
