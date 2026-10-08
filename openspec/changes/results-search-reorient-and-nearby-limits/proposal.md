# Proposal

## Why

Four rough edges:
- **Route Results endpoints:** the start and destination fields in the top bar are plain text boxes. Typing there skips Google Places autocomplete and recents, so endpoints can't be changed the way a destination was picked in the first place.
- **No way back to north-up:** after pinching and rotating the home map, there's no quick way to turn it back, which riders expect from other map apps.
- **Route detail has no way back to the whole route:** after zooming in, the only map control (current location) centers on the rider.
- **Nearby list size:** nearby discovery widens its radius in passes until it finds 8 routes. Once a pass widens, it takes every route in the wider circle, up to 30. A quiet area can jump from 5 nearby routes to 30, many of them far away, while a dense area is cut off at 30.

## What Changes

- **Route Results endpoints open search:**
  - Tapping the start or destination field opens the search page, which works exactly like the original one: Google Places autocomplete limited to the service area, the same loading, empty and error states, and session recents.
  - Choosing a place updates that endpoint and returns to Route Results with the other endpoint and the trip criteria unchanged. Cancel returns with nothing changed.
  - When editing the start, a "Current location" option comes first.
  - The fields are no longer typed into directly; swapping endpoints still works.
- **Reorient button on the home map:** when the rider has rotated or tilted the map, a compass button appears, pointing north. Tapping it animates the map back to north-up and flat, and the button hides again.
  - The web map can't be rotated, because it no longer uses a Map ID (removed so places could be hidden), so the button never appears there.
- **Route detail gets a crosshair button for the whole route:** a new crosshair control beside the current-location one fits the map to the entire line in the selected direction. The current-location control keeps centering on the rider. Only one is selected at a time, and panning clears both.
- **Nearby list size:**
  - Every route within each agency's base walking radius is listed, however many (a safety cap of 40 bounds pathological cases).
  - When fewer than 6 routes are that close, the search widens only until it reaches 6, and adds only the closest extra routes from the wider area: never the whole wider circle.
  - The list stays ordered by distance.
  - This replaces the current minimum of 8 and the cap of 30.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Modified:** "Route Results supports editable trip criteria" (endpoints are edited through the search page).
  - **Modified:** "Nearby search adapts to density" (all base-radius routes, widen only to 6, closest extras only).
- `mobile-ui-design`:
  - **Modified:** "Rider location on the live route map" (adds a crosshair control that fits the whole route).
  - **Added:** "Reorient button on the home map".

## Impact

- **App:**
  - `HomeScreen.tsx`: results view gains an origin; a search view for editing an endpoint; the reorient button.
  - `RouteResultsView.tsx`: endpoint fields become buttons.
  - `SearchView.tsx`: optional "Current location" row and initial query.
  - `GoogleMapView.native.tsx`: reports heading and pitch; reorient request.
  - `RouteMap.native.tsx` and `.web.tsx`: a fit-route request alongside the existing center-on-rider one.
  - `RouteDetailView.tsx`: the new crosshair button beside the location button.
  - `Icon.tsx`: a `crosshair` icon.
- **Backend:** `firebase/functions/src/gtfsDiscovery.ts` (`findNearbyTransit` selection). **Requires redeploying functions.**
- **Tests:** App tests for the endpoint search round trip, reorient visibility and reset, both route-map buttons; a functions test for the nearby selection rules.
- **Archive order:** this change modifies requirements added by `refine-route-detail-and-nearby` ("Nearby search adapts to density") and `route-detail-location-and-transfers` ("Rider location on the live route map"). Archive those first.
