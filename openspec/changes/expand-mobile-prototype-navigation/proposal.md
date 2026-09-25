# Proposal

## Why

The mobile prototype now communicates nearby arrivals clearly, but several visible controls lead nowhere and destination search stops before showing a usable trip. Expanding the local prototype into connected route, results, recents, and profile flows will make it possible to evaluate the full rider journey without requiring backend transit data or authentication.

## What Changes

- Simplify the home sheet by removing the large `Nearby transit` heading and allowing a fully lowered state that reveals the complete map.
- Reposition or hide the map location control while the sheet expands so it never overlaps sheet content.
- Replace the three-bar live marker with a two-arc wireless signal positioned at the upper-right of live minute values; scheduled values remain signal-free.
- Populate the Recents tab with destination-oriented trip entries and add mock Suffolk County Transit 51 and MTA Subway 7 routes.
- Make every home route card open a route-detail screen backed by shared route data rather than a Ronkonkoma-only path.
- Add a Route Results screen reached by selecting a search match, with editable origin and destination fields, leave-time and refresh controls, sorting preferences, recommended-first mock itineraries, route-segment badges, total fare, total duration, and next-ride timing.
- Add a placeholder profile/settings screen from the home profile control with basic account and settings rows including Sign out.
- Keep all new screens and interactions local and mock-data-driven; no live routing, payment, persistence, or authentication service is added.

## Capabilities

### New Capabilities

- `mobile-prototype-navigation`: Defines connected local prototype behavior for the adjustable map sheet, recent trips, shared route details, destination route results, and the placeholder profile/settings screen.

### Modified Capabilities

None. The repository currently has no archived main capability specs.

## Impact

- Affects mobile navigation state and presentation components under `mobile/src/components`.
- Extends local mock data under `mobile/src/data` for routes, recents, and trip itineraries.
- Generalizes the existing Ronkonkoma-specific detail presentation for multiple routes.
- Updates mobile interaction tests for search selection, route results, all route cards, sheet/map coordination, recents, and profile navigation.
- Does not alter the Express API or introduce new runtime services.
