# Tasks

## 1. Scheduling Model

- [x] 1.1 Add `TripTimeChoice`, `MOCK_NOW_MINUTES`, per-itinerary `departureOffsetMinutes` (replacing `nextRide`), and a pure `scheduleItinerary` plus a time formatter in `mobile/src/data/transit.ts`. Add unit tests in `transit.test.ts` covering now, depart-at (no departure before T), arrive-by (arrival at or before A), midnight wrap, and the unchanged "Leaves in 4 min · 10:04 AM" label for now.
- [x] 1.2 Make `PlannedTripDetailView` take the scheduled departure instead of parsing `nextRide`. Verify with a test that the planned-trip leave and arrive times equal the itinerary card's times for both the default and a Depart 10:30 AM choice.

## 2. Leave-Time Picker

- [x] 2.1 Build `WheelColumn` (snap ScrollView plus pressable items with a center highlight) and `LeaveTimeSheet` (Modal with a mode selector, hour/minute/period wheels, and Cancel/Done), with the documented test IDs. Add tests that selecting Depart at, hour 10, minute 30, PM, then Done reports the right choice, and that Cancel reports nothing.
- [x] 2.2 Wire the sheet into `RouteResultsView` through `tripTime` lifted into `HomeScreen`. The control label reads `Leave now`, `Depart 10:30 AM`, or `Arrive by 12:00 PM`, and the itinerary rows show the scheduled label. Replace the old `Leave: 10:30` assertion with a test of the picker flow and the updated card times, and verify refresh keeps the choice.

## 3. Modes and Filter

- [x] 3.1 Replace `optionsOpen` with `openPanel`, add Subway/Bus/Rail chips with `enabledModes` (keeping at least one on) and a count on the Modes pill, and keep Filter's preferences. Add tests that excluding Rail hides `itinerary-rail-fast`, that Filter still reorders, and that the two panels open independently.
- [x] 3.2 Add the `results-empty` state with a "Show all modes" reset. Verify with a test that excludes modes until none match, then resets.

## 4. Pins and Favorites

- [x] 4.1 Replace `pinnedRoutes`/`nearbyRoutes` with `allNearbyRoutes` and `DEFAULT_PINNED_ROUTE_IDS`. Add `pinnedRouteIds` state to `HomeScreen`, make the `RouteDetailView` pin controlled, and derive the Nearby groups in `TransitSheet`. Add tests that pinning route 51 moves it into the pinned group, that unpinning Ronkonkoma moves it down, that each route renders once, and that the tab minimum height is unchanged.
- [x] 4.2 Add a favorite star control (`route-favorite`) to `RouteDetailView`, and make the `SharedTripDetailView` favorite controlled. Add `favoriteRouteIds` and `favoriteTrips` state to `HomeScreen`, and pass it through both trip wrappers. Verify the existing `search-trip-favorite`/`recent-trip-favorite` selected-state tests still pass, and that the state stays selected after leaving and reopening the detail screen.
- [x] 4.3 Render the Favorites tab Routes and Trips sections, the favorite trip card variant, and the "No favorites yet" empty state, and wire navigation (routes open route detail; recent trips open recent detail; planned trips reopen results with the stored time and return to Favorites on Back). Add tests covering favoriting a route, a recent trip, and a planned trip, opening each from Favorites, and unfavoriting until the empty state returns.

## 5. Location Feedback

- [x] 5.1 Give `CurrentLocationButton` a selected state (filled icon, soft background, `accessibilityState.selected`). Verify with tests on home and Route Results that pressing it sets selected.

## 6. Integration Verification

- [x] 6.1 Run `npm run typecheck`, `npm run lint`, and `npm test` from the repo root, and resolve all regressions.
- [x] 6.2 Visual pass on the Android emulator: favorite and pin from route detail, favorite planned and recent trips, browse and open the Favorites tab, use the leave-time wheel (scroll and tap) for depart and arrive, toggle Modes including the empty state, and press the location buttons. Confirm the chosen time appears on the control, the cards, and the trip details.
- [x] 6.3 Run `npx openspec validate make-prototype-controls-functional --strict` and confirm every scenario is covered by the automated tests or the visual pass.

## 7. Follow-up Refinements

- [x] 7.1 Remove the "Pinned" heading and mark pinned cards with a small top-right thumbtack; verify with a test that the pinned card shows the thumbtack, unpinned cards do not, and no heading renders.
- [x] 7.2 Remove the Go and End buttons from the result cards; verify with a test that no `search-result-go-*` or `search-result-end-*` controls exist and that trips start and end from the planned trip detail.

