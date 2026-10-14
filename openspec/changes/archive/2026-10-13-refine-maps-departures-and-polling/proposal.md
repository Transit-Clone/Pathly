# Proposal

## Why

Using the app after the multi-agency merge turned up these problems.

**Home screen**
- The purple "searching here" ring doesn't look like the blue GPS dot.
- The map jumps back to the rider every ~10 s after they pan away. The GPS watch delivers a new `location` object every 10 s, and `GoogleMapView` re-centers on every new one.

**Route detail**
- The direction swipe sits on the prediction tiles, so the tiles can't scroll on their own.
- Only 3 departures are shown, and there is no way to see more.
- The route line doesn't show which way the vehicle is going.
- The vehicle markers' borders hurt legibility.
- The large badge (for example "Port Jefferson") covers part of the map.
- A transfer `+N` count can't be opened.

**Performance**
- `TransitLiveProvider` calls the backend separately for every nearby route (up to 30) plus the demo routes, every 15 s, whether or not the route is on screen. That floods the functions with requests and makes cold starts worse for the routes the rider is actually looking at.

## What Changes

### Home
- The search-center marker becomes a solid purple dot about the size of the blue GPS dot: a ~17 pt purple fill with a white ring, like `CurrentLocationMarker`. The faint 28 pt outlined ring goes away.
- The home map no longer re-centers when GPS updates. It centers on the first fix and whenever the location button is pressed. Otherwise it stays where the rider left it, and the blue dot keeps moving.

### Route detail
- **Two separate horizontal swipes:**
  - Swiping the destination heading switches direction, with page dots under the heading.
  - The departure tiles become their own horizontal scroll for the current direction.
- **Departures:**
  - The scroll shows up to 6 departure tiles, then a final "More departures" card.
  - The card opens a new page listing every remaining departure today (and into the next service day when today is nearly over) for that direction at the rider's stop.
  - The backend returns up to 6 departures per direction, and a new request returns the full list.
- **Direction on the line:**
  - The route line is drawn at full strength from the rider's nearest stop onward in the selected direction, and faded (about 35% opacity) behind it.
  - A small route-colored chevron arrow beside the nearest stop points toward the next stop.
- **Vehicle markers:**
  - The marker stays a white circle with the route-colored glyph, but loses its border.
  - It grows from 34 to 42 pt and gets a stronger soft shadow so it still shows on light map tiles.
  - The age badge also loses its white border.
- **Map badge:** the large badge over the map becomes a compact, short-name-only badge (no long name such as "Port Jefferson").
  - It is placed so it doesn't cover the map's center or the rider's nearest stop.
  - Touches pass through it.
- **Transfers:** a transfer row's `+N` becomes a button. Tapping it opens a sheet listing every transfer at that stop, as colored chips grouped by mode.

### Performance
- The app fetches live data only for routes the rider can see:
  - Nearby cards currently on screen in the home list.
  - Saved routes on the active tab.
  - The open route detail.
- Routes that scroll out of view stop being polled and keep their last value. Routes that come into view are fetched right away.

### Not in this change
- Batched live calls, precomputed GTFS indexes, warm `minInstances`, and an on-device cache are deferred. They are described in design.md as follow-ups.
- Station entrance and exit locations are deferred. None of the four bundled feeds publish entrances; the NYC subway's entrances are available as a separate open dataset. A follow-up change is suggested in design.md.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-ui-design`:
  - **Modified:** "Glanceable route-detail hierarchy" (direction swipe on the heading; departure scroll).
  - **Modified:** "Prediction tile timing" (up to 6 tiles plus "More departures").
  - **Modified:** "Home map center search" (solid dot; the map keeps its position).
  - **Modified:** "Inverted live vehicle markers" (no borders, larger).
  - **Modified:** "Stop transfers" (`+N` opens the full list).
  - **Added:** "All upcoming departures page", "Route line shows direction of travel", and "Map badge stays out of the way".
- `mobile-prototype-navigation`:
  - **Added:** "Home map keeps the rider's view" and "Live data is fetched only for visible routes".

## Impact

- **App:**
  - `HomeScreen.tsx` (search-center style, recenter request, visible-route set).
  - `GoogleMapView.native.tsx` and `.web.tsx` (recenter only on request or first fix).
  - `RouteDetailView.tsx` (heading pager, departure scroll, More card, transfer sheet, badge).
  - New `DeparturesView.tsx`.
  - `RouteMap.native.tsx` and `.web.tsx` (split line, arrow, markers).
  - `RouteBadge.tsx` (compact size if needed).
  - `TransitSheet.tsx` (reports visible card ids).
  - `TransitLiveContext.tsx` (polls only the visible set).
  - `transitLive.ts` (departures list call).
- **Backend:**
  - `gtfsSchedule.ts`: `PREDICTIONS_PER_DIRECTION` goes to 6, plus a `limit` option for the full list.
  - `index.ts`: new `getStopDepartures` callable.
  - **Requires redeploying functions.**
- **Tests:** App tests for the heading swipe, the departure scroll and More page, the transfer sheet, the home map not snapping back, the search dot style, and polling only visible routes. Marker style tests are updated.
- **Archive order:** this change modifies requirements added by `refine-route-detail-and-nearby` and `route-detail-location-and-transfers`, and by `refine-route-detail-ui` ("Glanceable route-detail hierarchy"). Archive those first.
