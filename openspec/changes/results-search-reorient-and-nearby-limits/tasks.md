# Tasks

## 1. Route Results endpoints through search

- [x] 1.1 Lift `origin` (default label "Current location"), `destination`, modes and filter preference from `RouteResultsView` into HomeScreen's `results` view state. Pass them as props with `onSwap`, and keep the existing behavior. Verify all existing Route Results App tests pass unchanged except for selectors renamed in 1.2.
- [x] 1.2 Turn the origin and destination fields into `origin-field` and `destination-field` buttons that call `onEditEndpoint`. Add the HomeScreen `search` state for editing an endpoint (initial query = field text), and `SearchView`'s optional "Current location" first row. Selection sets the field and returns; cancel returns unchanged. Verify with App tests: editing the destination via "stony" sets Stony Brook University with the leave time, modes and filter unchanged; choosing "Current location" for the origin; cancel leaves both endpoints unchanged; the Places mock receives the typed query.

## 2. Reorient compass

- [x] 2.1 Extend the react-native-maps mock with `getCamera` and `animateCamera`. Have `GoogleMapView.native` report `onOrientationChange` after gestures, and animate to heading 0 / pitch 0 on `reorientRequest`. Verify with App tests: a mocked camera with heading 90 shows the `reorient-map` button with its needle rotated by -90°; pressing it calls `animateCamera` with heading 0 and pitch 0; and after the camera reads 0 the button is gone.
- [x] 2.2 Confirm the web map never shows the button (`GoogleMapView.web` never reports rotation). Verify by inspection and a test that rendering the web component doesn't call `onOrientationChange`, or document it as covered by 2.1 if the web component isn't testable in jest. (Verified by inspection: the web component accepts the prop only for type parity and never destructures or calls it; jest runs the iOS build, so the `.web.tsx` file isn't exercised by tests.)

## 3. Route detail fits the whole route

- [x] 3.1 Add `showRouteRequest` to `RouteMap.native` (`fitToCoordinates` with padding) and `RouteMap.web` (`fitBounds`), alongside the existing `centerOnUserRequest`, and add a `crosshair` icon. Add the `route-overview` crosshair button to `RouteDetailView` below `route-location` (label "Show the whole route", no location refresh). Only one is selected at a time, and a pan clears both. Verify with App tests: the crosshair calls the mocked `fitToCoordinates` with every point of the selected direction's line and doesn't refresh the location; the GPS button still refreshes and centers; pressing one deselects the other; panning clears both.

## 4. Nearby list size

- [x] 4.1 Rework `findNearbyTransit` per design §4 (all base-radius routes up to 40; otherwise widen only to reach 6, adding only the closest extras). Verify with a functions test against the bundled feeds: at Stony Brook the result has at least 6 routes, the routes beyond the base radius are the closest ones only, and the list is sorted. At Midtown, every route within the base radius is listed (count equals the base-radius route count) without widening. Run a local before/after comparison at both points and record the counts. (Recorded: Stony Brook went from 13 routes reaching 29.4 km to 6 reaching 6.2 km; Midtown went from 30 (cut off) to all 31 within walking range.)

## 5. Integration

- [ ] 5.1 Run `npm test`, `npm run typecheck` and `npm run lint` in `mobile/`, and `npm test` in `firebase/functions`. Deploy functions. On web, check the endpoint round trip and the route-fit button. On a phone build, check the compass appears on twist and reorients.
