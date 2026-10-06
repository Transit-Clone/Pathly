# Proposal

## Why

The route-detail page carries detail riders don't need and misses detail they do:
- A "Service alerts · No delays" dropdown opens to say nothing is wrong.
- Every stop has a redundant "Departs / Scheduled stop / Final stop" caption.
- The small faded "SCHEDULED" label is easy to miss.
- On the one route with a real Google map (Port Jefferson Branch), the map ignores touch and marks stations with Google's default red pins. Riders can't zoom in to see where each stop actually is.

Service alerts are not live data today. Each route carries a fixed placeholder sentence in `transit.ts`, and only one mock route has an advisory.

## What Changes

- **Service alerts:** the alert row and its dropdown are shown only when the route has an advisory. "No delays" routes show no alert row at all.
- **Stop timeline:** each row shows only the stop name and its time. The "Departs", "Scheduled stop", and "Final stop" captions are removed, and the row divider now runs under the time too. Screen-reader labels still say whether the time is a departure or an arrival.
- **Scheduled label:** the "Scheduled" label on timetable prediction tiles sits on a rounded, filled pill so it reads clearly against both plain and route-colored tiles. Every tile reserves space at the bottom so the pill doesn't crowd the `minutes` label.
- **Live route map (Port Jefferson Branch only):**
  - The visible map area is directly interactive: drag to pan, pinch (or scroll wheel / trackpad on web) to zoom.
  - Dragging the route content still scrolls the page over the map.
  - Default red stop pins become white dots outlined in the route color. Tapping a dot shows the station name.
  - The route line uses the route's own color instead of a hard-coded value, and it follows the real track geometry from LIRR's GTFS `shapes.txt` instead of straight lines between stations.
  - Live trains, which showed as red default pins on web, become rounded-square route-color badges with a white train glyph, so they can't be mistaken for the round station dots.
- **Unchanged:** routes that use the illustrated map, and trip-detail screens.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-ui-design`:
  - "Glanceable route-detail hierarchy": the alert control only appears with an advisory, stop rows show name and time only, and the Scheduled label is a pill.
  - "Stationary detail map backdrop": the live route map's visible area accepts pan and zoom gestures.
  - "Route map overlay": the live route map's stops are white dots in the route color that show their name when tapped.

## Impact

- **Code**:
  - `mobile/src/components/RouteDetailView.tsx`: alert row, timeline captions, Scheduled pill, and passing the route color to the map.
  - `mobile/src/components/DetailMapPage.tsx`: an opt-in interactive-map mode.
  - `mobile/src/components/LirrRouteMap.native.tsx` and `LirrRouteMap.web.tsx`: stop dots, train markers, track shape, gestures, and route color.
  - New `mobile/src/data/portJeffersonShape.ts`: generated track geometry (about 230 points).
  - Tests in `mobile/__tests__/`.
- **Dependencies**: none new.
- **Risk**: letting touches pass through the scroll view to the native map relies on `pointerEvents="box-none"` on `ScrollView`. This needs checking on a real Android and iOS device; see design.md.
