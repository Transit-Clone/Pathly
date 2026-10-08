# Design

## Context

- **Route Results:** `RouteResultsView` keeps `origin` (default "Current location") and `destination` in its own state and renders them as free-text `TextInput`s (`origin-input`, `destination-input`) with a swap button. `HomeScreen`'s `results` view stores only `destination` and `returnTo`. `SearchView` (Places autocomplete, recents, all states) takes `initialQuery`, `onCancel`, `onSelect(place)`.
- **Home map:** `GoogleMapView.native` uses react-native-maps with Google; rotate and tilt gestures are on by default, and the built-in compass is hidden (`showsCompass={false}`). The web map has no Map ID any more (so inline styles can hide places), and Google only allows rotation on Map-ID maps.
- **Route detail:** the location button increments `centerOnUserRequest`, which `RouteMap` uses to refresh and follow the rider. Panning clears `isLocationCentered`.
- **Nearby search:** `findNearbyTransit` widens in passes of 1/2/4/8× the base radius until it finds 8 routes. Each pass keeps every resolved route inside the current radius, then caps the list at 30.

## Goals / Non-Goals

**Goals:**
- Endpoint editing that is the original search page, reused rather than re-implemented.
- A compass that appears only when the map is rotated or tilted and restores north-up.
- A location button on route detail that frames the whole route.
- A nearby list that shows everything close and only the nearest extras when the area is sparse.

**Non-Goals:**
- Real routing between arbitrary endpoints (results stay illustrative, as today).
- Rotation on the web map.
- Changing per-agency base radii or maximum radii.

## Decisions

### 1. Endpoint editing reuses SearchView
- **State moves up:** `origin` and `destination` move from `RouteResultsView` into `HomeScreen`'s `results` view state, as display strings, with the origin defaulting to "Current location" (a plain label, so swapping endpoints just exchanges the two strings). This lets them survive the round trip through search.
- **Fields become buttons:** each field is a `PressableScale` (`origin-field`, `destination-field`) showing its value. Tapping it calls `onEditEndpoint('origin' | 'destination')`.
- **Opening search:** HomeScreen switches to `{ name: 'search', editing: { field, results } }`.
  - `SearchView` gets `initialQuery` (the field's text; empty for "Current location").
  - It also gets an optional `currentLocationOption`, which renders a "Current location" row first. Choosing it calls `onSelect` with a sentinel place, which HomeScreen maps to `origin: null`.
- **Returning:**
  - A selection writes the chosen title into that field and returns to the saved `results` state (time choice, modes and filter are already lifted or kept, see below).
  - Cancel returns to the saved state unchanged.
  - Recents behave exactly as on the main search, because it *is* the main search.
- **Swap** exchanges the two values in HomeScreen state.
- **Trip criteria:** `tripTime` already lives in HomeScreen. Modes and filter preference also live in `RouteResultsView` local state. To keep them across the round trip, they move into HomeScreen's results state too. Alternative considered: keep `RouteResultsView` mounted under the search view. Rejected because the app renders one screen at a time, and lifting the state is simpler.

### 2. Reorient compass (native home map)
- **Showing it:** after `onRegionChangeComplete` (and during `onPanDrag`, throttled), `mapRef.getCamera()` reads `heading` and `pitch`. The map counts as rotated when the heading is more than 2° from north (normalized to −180..180) or the pitch is above 2°. It reports `onOrientationChange({ heading, rotated })` to HomeScreen.
- **The button:** HomeScreen renders a 40 pt round compass button above the location button whenever the map is rotated. It has a north needle rotated by `-heading`, so it points to true north, and the label "Reorient map to north". It fades and scrolls with the location button.
- **Tapping it** increments `reorientRequest`. `GoogleMapView.native` then calls `animateCamera({ heading: 0, pitch: 0 }, { duration: 300 })`, keeping the center and zoom, and the next camera read hides the button.
- **Web:** `GoogleMapView.web` never reports rotation, so the button never shows.
- **Tests:** the react-native-maps mock gains `getCamera` (returning a settable camera) and `animateCamera` (a shared jest.fn).

### 3. Route detail: crosshair fits the route, GPS still centers on the rider
- `RouteMap` takes two requests:
  - `centerOnUserRequest`: unchanged; refreshes and follows the rider until a pan.
  - `showRouteRequest`: new; stops following the rider, then fits the line. On native it calls `mapRef.fitToCoordinates(line points, { edgePadding: { top: 90, right: 40, bottom: 60, left: 40 }, animated: true })`; on web, `map.fitBounds(bounds of the line, padding)`.
- `RouteDetailView` adds a crosshair button (`route-overview`, Ionicons `locate`, label "Show the whole route") below the current-location button. Each has its own selected state, pressing one clears the other, and a pan clears both. The crosshair doesn't refresh the location.
- The rider first asked for the GPS button itself to fit the route, then changed to two separate buttons. The plan follows the second request.

### 4. Nearby selection (`findNearbyTransit`)
```
base = resolve every candidate route within each agency's base radius
if base.length >= MIN (6): return base sorted by distance, first MAX_SAFETY (40)
for multiplier in [2, 4, 8]:
  widened = resolve candidates within min(base × multiplier, agency cap)
  extras = widened routes not in base, sorted by distance
  if base.length + extras.length >= MIN or this is the last pass:
    return [...base, ...extras.slice(0, MIN - base.length)] sorted by distance
```
- `MIN_NEARBY_ROUTES` becomes 6. `MAX_NEARBY_ROUTES` becomes a safety limit of 40, applied only to the base list.
- The candidate discovery (400 stops per agency) and per-route resolution are unchanged.
- The `limit` parameter stays as an upper bound.

## Risks / Trade-offs

- **Dense areas get longer lists** (up to about 25–40 in Midtown). → Polling only visible cards keeps live requests to the cards on screen, and route cards are cheap to render.
- **A big state move in Route Results** (modes and filter lifted). → Existing Route Results tests cover these controls and must keep passing; new tests cover the round trip.
- **`getCamera` is async** and called often during gestures. → Throttle to the end of each gesture (`onRegionChangeComplete`) plus one read on `onPanDrag` at most every 200 ms.
- **Fitting a long route on a short map** may zoom far out. → That's what "the whole route" means; padding keeps the ends clear of the controls.
