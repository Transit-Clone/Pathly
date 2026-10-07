# Proposal

## Why

Using the merged multi-agency app surfaced rough edges on the route-detail page and home screen:
- Scheduled times don't look different enough from GPS-tracked ones.
- A single departure can fill the whole time row.
- Long waits read as "124 minutes".
- Direction labels repeat "Westbound to…".
- Cards show long route names.
- Route detail has both pin and favorite buttons, plus a misleading fare row.
- Transfers list every LIRR branch.
- Only the Port Jefferson Branch follows its real track.
- Nearby often lists only a couple of routes, and you can't explore another area.
- The first load is slow.
- Route detail jumps back to Home while you're reading it.

## What Changes

- **Prediction tiles:**
  - At least three per direction, fixed at a third of the row each. The backend's timetable fallback is turned on for every agency and looks ahead into the next service day.
  - "Due" becomes `0 minutes`, and past departures are dropped.
  - Departures 60 or more minutes away show the clock time (`5:00 PM`).
  - Scheduled tiles are about half as opaque as live ones, and tile borders go from 2 pt to 3 pt.
- **Labels:**
  - Directions show only the destination ("Penn Station", "Patchogue"), never "Westbound to" or "Toward".
  - Home card titles use the route's short name ("51", "E").
- **Controls:**
  - **BREAKING (UX):** one Save star replaces both pin and favorite. Saved routes lead Nearby, with a star marker, and appear in Favorites.
  - No route is saved by default; this removes the hardcoded Port Jefferson default pin.
  - The fare row is removed from route detail.
- **Transfers:** A LIRR route no longer lists other LIRR branches.
- **Live vehicle markers:** colors are inverted. The marker becomes a white circle (instead of a square) with a route-color border and glyph, and its corner "updated" badge becomes route-color with white text.
- **Track geometry:** the backend returns each direction's real GTFS shape with its stop list, for every agency. The bundled Port Jefferson shape is deleted.
- **Home exploration:**
  - Panning the home map shows a purple circle at the map center, and Nearby re-queries for that point.
  - The location button returns to the rider.
- **Adaptive nearby radius:** the search widens from per-agency base radii until about eight routes are found, up to a maximum. Dense areas stay focused.
- **Performance:**
  - One backend call per route resolves the nearest stop and departures together (two calls today).
  - Route detail fetches its stop list and shape in parallel with live data.
  - Cards fill in independently.
- **Bug fix:** route detail no longer bounces to Home when location updates re-fetch the nearby list.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Modified:** "Session favorites appear in the Favorites tab" (saved routes).
  - **Removed:** "Routes can be pinned to Nearby".
  - **Added:** "Saved routes lead the Nearby list", "Nearby search adapts to density", and "Route detail stays open while location updates".
- `mobile-ui-design`: adds the following, without modifying requirements that the four earlier unarchived changes also touch:
  - "Prediction tile timing" and "Scheduled tiles read as untracked";
  - "Destination-only direction labels" and "Transit card titles use the route's short name";
  - "Single save control and no fare row on route detail";
  - "Real track geometry for every live route" and "Transfers show other modes only";
  - "Home map center search" and "Fast first load of live data";
  - "Inverted live vehicle markers".

## Impact

- **Backend** (`firebase/functions/src`):
  - `gtfsSchedule.ts`: fallback for all agencies, next-day lookahead.
  - `gtfsAgencies.ts`: fallback flags.
  - `gtfsStaticData.ts`: trip `shape_id`, shapes loader.
  - `gtfsDiscovery.ts`: geometry `path`, adaptive radius.
  - `index.ts`: `getRouteLiveStatus` optionally takes the rider location and returns the nearest stop.
  - **Requires redeploying functions.**
- **App:**
  - `RouteDetailView`, `TransitCard`, `TransitSheet`, `HomeScreen`, `GoogleMapView.native/web`, `RouteMap.native/web`.
  - `TransitLiveContext`, `transitLive`, `routeGeometry`, `nearbyTransit`, `transit.ts` (default saved list).
  - `lirrFares` usage on route detail is removed.
- **Deleted:** `mobile/src/data/portJeffersonShape.ts`.
- **Tests:** App tests for pin and fare are rewritten, and new tests cover tiles, labels, saving, center search, and navigation stability.
- **Archive order:** archive the four earlier implemented changes before this one, so the main specs they update exist when this change's requirements are merged.
