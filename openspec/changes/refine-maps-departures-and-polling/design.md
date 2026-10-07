# Design

## Context

- **Home map snap-back.** `GoogleMapView` (native and web) re-centers inside a `useEffect` keyed on the `location` object. `useCurrentLocation` runs `watchPositionAsync` (10 s / 25 m) and sets a fresh object on each update, so the map animates back to the rider every update. `refresh()` relies on the same effect to make the location button work, which is why the snap-back was never noticed as a bug.
- **Route-detail tiles.** On native, the tiles live inside a paging `ScrollView` with one page per direction. On web, a `PressableScale` handles drag-to-swipe for direction. Either way, the tiles can't scroll on their own. The heading is plain text.
- **Departure counts.** The backend caps departures at `PREDICTIONS_PER_DIRECTION = 3` in `gtfsSchedule.ts`. Static stop times for a route are already cached per instance (`loadRouteStopTimes`), so returning more rows costs almost nothing extra.
- **Route map.** `RouteMap.native/web` draws one `Polyline` over `path ?? stops`. Stops carry `stopId`, and the nearest stop is `focusStopId`. `path` is the trimmed GTFS shape for the selected direction, ordered in the direction of travel (`getRouteGeometry` builds it per `directionId`).
- **Vehicle markers.** These are currently 34 pt white circles with a 3 pt route-color border. The age badge has a 1.5 pt white border. Task 5b.1 of `refine-route-detail-and-nearby` is superseded by this change's marker requirement.
- **Polling.** `TransitLiveProvider` polls every route in `STATIC_LIVE_ROUTES` plus every discovered nearby route (up to 30) every 15 s. Each poll is its own `getRouteLiveStatus` call. `TransitSheet` renders cards in a single `Animated.ScrollView`, not a virtualized list, and every card is a fixed `TRANSIT_CARD_HEIGHT` (104).
- **Transfers.** Transfer chips come from the generated `stationTransfers.ts`. Only the Port Jefferson Branch uses them today.

## Goals / Non-Goals

**Goals:**
- Recentering the home map happens only when the rider asks for it. The rider's dot keeps tracking GPS.
- Direction and departures each get their own horizontal gesture on route detail. Up to 6 tiles are shown, plus a "More departures" page.
- The route line shows the direction of travel at a glance.
- Live markers and the map badge are easier to read and stay out of the way.
- `+N` transfers can be opened.
- Live-data requests drop roughly from (all nearby routes + demo routes) to (visible cards + open route).

**Non-Goals:**
- Batched calls, precomputed indexes, `minInstances`, and on-device caching (see "Performance follow-ups").
- Station entrances and exits (see "Entrances follow-up").
- Changing the trip-detail or illustrated route maps beyond keeping them working.
- Persisting anything across sessions.

## Decisions

### 1. Home recenter by request, not by location identity
- `GoogleMapView` gets a `recenterRequest: number` prop. HomeScreen increments it when the location button is pressed and when the first `located` fix arrives (tracked with a ref, so it fires once).
- The map animates (native) or `panTo`s (web) only when `recenterRequest` changes.
- Native: `region` stays controlled for clamping, but it is no longer reset from `location`.
- Web: drop the controlled `center` prop after load and use `map.panTo` on request. Re-apply the `panBy(0, -topInset/2)` offset after each programmatic pan.
- The web user dot still updates its position from `location`. Native uses `showsUserLocation`.
- Why: it matches how `RouteMap` already handles `centerOnUserRequest`. It also avoids comparing coordinates, which would make "press the button without moving" a no-op.
- Alternative considered: ignore `location` changes after `onUserPan`. Rejected because it still snaps back if the rider zooms without panning, and the state is harder to follow.

### 2. Search-center dot
- Reuse the dot geometry of `CurrentLocationMarker`: 17 pt, 3 pt white ring, shadow. Fill it with `colors.searchCenter` and leave out the halo.
- `SEARCH_CENTER_SIZE` becomes 17. The `top` calculation is unchanged.

### 3. Route-detail layout: heading pager and departure scroll
- **Heading pager.**
  - The heading becomes a horizontal paging `ScrollView` with one page per direction and the destination text in each. The page dots move directly under it.
  - On web, the existing `handleDirectionPressIn/Out` drag logic moves from the tiles to the heading wrapper.
  - The `directionScrollRef` sync effect now targets the heading pager.
- **Departure scroll.**
  - A non-paging horizontal `ScrollView` (`snapToInterval = tileWidth + 8`, `decelerationRate="fast"`) holds up to 6 tiles followed by the More card.
  - It shows only the active direction, so the native per-direction tile pages go away.
  - Tile width stays `(pageWidth - 16) / 3`.
  - On web, mouse users get drag-to-scroll through the same press-in/press-out delta pattern, applied to `scrollTo` offsets instead of a direction index. Wheel and trackpad already scroll a horizontal `ScrollView` on web.
  - The scroll resets to x = 0 when the direction changes.
- **Tap behavior.** Tapping a tile keeps its current meaning: it selects that trip for the stop timeline. On web, a drag beyond the threshold scrolls, while a tap selects.
- **Why separate:** the request asked for two independent horizontal gestures. Nesting a tile scroll inside a direction pager would make the gestures fight.

### 4. Six tiles, More card, and departures page
- **Backend:**
  - `PREDICTIONS_PER_DIRECTION` goes to 6.
  - `getStopPredictions` takes an optional `limit` (default 6). The next-day lookahead is triggered when there are fewer than `min(limit, 6)` departures.
  - New callable `getStopDepartures({ agencyId, routeId, direction1StopId, direction0StopId, directionId })` returns `{ departures: DirectionPrediction[] }` for one direction. It uses the same realtime merge with `limit = 200`, covering the rest of today plus tomorrow when today has fewer than 6. It reuses `getRouteStatus` for live trips.
- **App:**
  - `fetchStopDepartures` in `transitLive.ts` calls it without caching; the page refetches when it mounts.
  - The `predictionsForDirection` mock padding for routes without a live source stays at 3, plus the More card. For those routes, the departures page shows the same padded mock list (they are illustrative).
- **Navigation:**
  - New `DeparturesView.tsx`. HomeScreen's `ActiveView` gets `{ name: 'departures'; routeId; route; directionIndex; returnTo: 'route' }`.
  - Back returns to `{ name: 'route', ... }` with `initialDirectionIndex`, so `RouteDetailView` reopens on the same direction. It gets an `initialDirectionIndex` prop that also counts as an auto-selection, so the auto-select logic doesn't override it.
  - BackHandler: `closeCurrentView` handles `departures`.
- **Rows:** the clock time (`formatClockTime`) on the left, and `departureDisplay` minutes on the right, with a `LiveSignal` or the `Scheduled` pill.
- **Why a separate page** rather than expanding inline: the request asked for "another page", and a long list in the detail scroll would push the stop timeline far down.

### 5. Direction-of-travel line
- **Split the path at the nearest stop.**
  - Find the path index closest to `focusStop` (squared-distance scan over `path`; at most a few hundred points after simplification).
  - `behind = path[0..i]` is drawn faded (native `strokeColor` with `59` hex alpha ≈ 35%; web `strokeOpacity: 0.35`).
  - `ahead = path[i..]` is drawn at full strength. The faded segment has the lower zIndex.
  - With no `path`, split the stop list the same way.
- **Arrow.**
  - Use the bearing from `path[i]` to `path[min(i + k, last)]`, where `k` is the first point at least ~150 m along. This avoids noisy bearings from closely spaced points.
  - Native: a small `Marker` at a point ~120 m ahead of the stop along the line, with a chevron `View` rotated to the bearing (`flat`, so it rotates with the map).
  - Web: a `Marker` with `google.maps.SymbolPath.FORWARD_CLOSED_ARROW`, `rotation: bearing`, `scale: 4`, route-color fill.
- **No focus stop:** single full-strength line and no arrow, as today.
- **Alternatives considered:** a gradient polyline (not supported consistently across native and web), and repeated arrow icons along the line (web `icons` repeat looks busy on long routes). One arrow at the rider's stop matches the "where am I going from here" question.

### 6. Vehicle marker and age badge
- **Native:**
  - `VEHICLE_SIZE` 42 and `VEHICLE_BOX` 54; anchor recomputed.
  - `borderWidth: 0`; shadow `opacity 0.35`, `radius 5`, `elevation 6`; glyph size 22.
  - Age badge: `borderWidth: 0`, keeping its route-color fill.
- **Web:**
  - The SVG circle drops its `stroke` and gets a stronger `feDropShadow` (`stdDeviation 2.5`, `flood-opacity 0.45`).
  - The glyph group is scaled up about 1.2×, and the badge circle drops its stroke. Sizes match native.
- Stop dots stay at 14 pt, so the "3× diameter" distinction holds.

### 7. Compact map badge
- Use `RouteBadge size="medium"` (or a new `compact` size if medium still reads large) with `withModeIcon`.
- Pass a short label only. LIRR's `routes.txt` has no `route_short_name` column, so discovered LIRR routes get `shortName` = the long name (for example "Port Jefferson Branch").
- Add a `badgeLabel(route)` helper:
  - Use `shortName` when it is ≤ 4 characters.
  - Otherwise, for LIRR, use a fixed map of the branches' common two-letter codes (Port Jefferson → `PJ`, Ronkonkoma → `RK`, Babylon → `BY`, and so on), matching the demo catalog's `PJ`.
  - Otherwise, use the initials of the name without "Branch" or "Line", capped at 4 characters.- Position: `top` moves from 120 to just below the back button (about 66), left 14, inside the existing `pointerEvents="none"` overlay.
- On the live map, the focus camera is centered on the nearest stop, so a top-left badge never covers it.

### 8. Transfer sheet
- `+N` becomes a `PressableScale` (`accessibilityRole="button"`, label "Show all N transfers at {station}").
- It opens a `Modal` (transparent, slide-up) owned by `RouteDetailView`, with state `{ stopName, transfers } | null`.
- The sheet shows the station name, then a section per mode (Rail, Subway, Bus) with the same chip component, and a close button. Tapping the backdrop or the Android back button closes it (`onRequestClose`).
- The detail scroll position is untouched because the modal sits above it.
- Why a modal rather than a new `ActiveView`: it's a quick peek, and it keeps scroll position for free.

### 9. Poll only visible routes
- **TransitSheet** reports `onVisibleRouteIdsChange(ids)`.
  - It knows each card's y position from `onLayout` (cards are fixed height, but saved and nearby sections have headers, so measuring is safer).
  - It computes the cards intersecting `[scrollY, scrollY + viewportHeight]` in page coordinates, using the sheet's own layout offset.
  - It recomputes on a throttled scroll listener (~250 ms) and on tab or list changes, and emits only when the id set changes. Only the active tab's cards count.
- **HomeScreen** derives `activeLiveRouteIds`:
  - Route view, departures view: `[openRouteId]`.
  - Home: the visible card ids.
  - Other views: `[]`. Search, results, recent trips, and profile don't show live route data.
- **TransitLiveProvider** gets `activeRouteIds`.
  - It keeps `liveStatus` for every route it has ever seen.
  - On each 15 s tick it loads only active routes. When the active set gains ids, those routes load immediately (if their last fetch is older than 5 s), without restarting the interval for the others.
  - `STATIC_LIVE_ROUTES` follow the same rule; they are no longer always polled.
  - A location change still reloads active routes immediately.
- **Inactive routes** keep their last `loaded` value. Never-loaded inactive routes stay `loading`, so a card that becomes visible shows its spinner until its fetch lands.
- **Applying live data:** applying stored data with `useNow` still ages countdowns and drops past departures for cards coming back into view, so stale data never shows a negative or passed time.
- **Why client-only:** this is the user's pick, and it is the biggest win for no cost. It cuts per-tick calls from ~30+ to ~3–4 on home and 1 on route detail.

### Performance follow-ups (not in this change)
- **Batch endpoint:** `getRoutesLiveStatus([...])` would turn the visible set into one HTTP call per tick and let one warm instance answer all of them. It needs a functions deploy and a client fan-out.
- **Precomputed GTFS indexes:** a build step that writes per-route stop_times JSON (and the stop→route index) into `static_data/derived/`. Cold starts would then read a few KB instead of streaming the 42 MB subway `stop_times.txt`. This is the biggest backend latency win.
- **Single function or `minInstances`:** v2 functions each run as their own Cloud Run service, so `getRouteLiveStatus`, `findNearbyTransit`, and `getRouteGeometry` each cold-start and load GTFS separately. Options are to consolidate them behind one callable or set `minInstances: 1` on the hot two (roughly $5–15 per month each). Deploying in `us-east1` or `us-east4` would also cut latency from NY.
- **On-device cache:** keep the last nearby list and route geometry in AsyncStorage and show them instantly while revalidating.

### Entrances follow-up (not in this change)
- None of the bundled GTFS feeds (LIRR, NYC Subway, NICE, Suffolk) contain entrances. There are no `location_type = 2` rows and no `pathways.txt`.
- NYC Subway entrances are published separately as the open dataset "MTA Subway Entrances and Exits" on data.ny.gov. It gives each entrance's station complex, entrance type (stair, elevator, escalator), and coordinates, so the subway is feasible.
- A follow-up change could extend `scripts/` to generate per-station entrance points and draw them as small markers on the route map when zoomed in.
- LIRR, NICE, and Suffolk publish no entrance data. LIRR station platforms could at best be drawn from OpenStreetMap, which comes with licensing and accuracy caveats.

## Risks / Trade-offs

- **Nested horizontal gestures** inside the vertical detail scroll may conflict on Android. → Keep the heading pager and the tile scroll as siblings, not nested. Verify on a device that a vertical drag starting on the tiles still scrolls the page.
- **Visibility measurement drift:** card layouts change when live data loads (spinners vs. times). → Recompute on every card `onLayout`. Being slightly off only fetches one extra card or one fewer, and the next scroll corrects it.
- **Visible-only polling** means a card scrolled into view shows its last value (possibly minutes old) until its fetch lands. → Countdowns are aged on the client and past entries are dropped. The newly visible fetch fires right away.
- **The 6-departure backend change needs a deploy.** → The client tolerates 3 (it shows what it gets, plus More). If `getStopDepartures` is missing, the page shows "Departures unavailable" instead of failing.
- **Line split near loops:** a closest-point search on routes that pass near the same stop twice could pick the wrong index. → Restrict the search to the path segment between the stops before and after `focusStop` in the stop sequence.
- **Archive order:** this change modifies requirements that exist only in earlier unarchived changes. → Archive `refine-route-detail-ui`, `route-detail-location-and-transfers`, and `refine-route-detail-and-nearby` first.
