# Proposal

## Why

Several prototype controls look interactive but do nothing useful. The trip favorite star toggles its own icon, but nothing appears in the Favorites tab, which always shows an empty state. The route pin does not pin anything. Leave only cycles through three hard-coded labels. Modes and Filter open the same preference row. The current-location buttons are no-ops. Design review needs these flows to behave believably, and none of them needs a backend: session-only local state is enough.

## What Changes

- **Favorites:** the trip-detail star (planned and recent) and a new star on route detail add or remove items in a session-wide favorites store. The Favorites tab lists favorite routes (as the existing transit cards) and favorite trips (as recent-style cards), opens them on tap, and shows the empty state only when nothing is saved. Favorite state is consistent everywhere the item appears.
- **Pinning:** the route-detail pin adds or removes the route from the pinned group at the top of Nearby, and Nearby reorders accordingly. Ronkonkoma starts pinned, matching today's data.
- **Leave time:** the Route Results leave control opens a bottom sheet with a Leave now / Depart at / Arrive by selector and scrollable hour, minute (5-minute steps), and AM/PM wheels. Confirming shows the choice on the control (for example "Depart 10:30 AM" or "Arrive by 12:00 PM") and recomputes every itinerary's departure and arrival times. Those times carry into the planned trip details.
- **Modes:** Modes becomes a real Subway / Bus / Rail filter that hides itineraries using an excluded mode, with an empty state and a reset action. Filter keeps the Fastest / Fewer transfers / Lowest fare ordering.
- **Current location:** the location buttons on home and Route Results show a selected, centered state, matching the behavior of the detail screens.
- All state is session-only and resets on reload. There are no new dependencies and no backend.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-prototype-navigation`: Update "Route Results supports editable trip criteria" for the time picker and the separate mode filter. Add requirements for session favorites, route pinning, and current-location feedback.

## Impact

- Code: `HomeScreen.tsx` (session state for favorites, pins, and navigation from Favorites), `TransitSheet.tsx` (Favorites and Nearby rendering), `RouteDetailView.tsx`, `SharedTripDetailView.tsx` and its wrappers (controlled favorite/pin props), `RouteResultsView.tsx` plus a new `LeaveTimeSheet.tsx`, `PlannedTripDetailView.tsx` (departure from the chosen time), `CurrentLocationButton.tsx`, `data/transit.ts` (itinerary departure offsets), and tests.
- Sequencing: this change is implemented after `refresh-icons-badges-and-detail-scroll` and reuses its `Icon`, `RouteBadge`, `DetailMapPage`, and the redesigned Recents card.
- Test IDs are preserved. The results test that asserts `Leave: 10:30` is updated for the new picker.
