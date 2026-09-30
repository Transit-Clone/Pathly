# Proposal

## Why

The mobile prototype now communicates nearby arrivals clearly, but several visible controls lead nowhere and destination search stops before showing a usable trip. At the same time, the project design has replaced the preliminary standalone Express/MongoDB architecture with Firebase. Expanding the local rider journey and removing obsolete backend scaffolding keeps the runnable repository aligned with the updated design before live Firebase services are introduced.

## What Changes

- Simplify the home sheet by removing the large `Nearby transit` heading and allowing a fully lowered state that reveals the complete map.
- Reposition or hide the map location control while the sheet expands so it never overlaps sheet content.
- Replace the three-bar live marker with a two-arc wireless signal positioned at the upper-right of live minute values; scheduled values remain signal-free.
- Populate the Recents tab with destination-oriented trip entries and add mock Suffolk County Transit 51 and MTA Subway 7 routes.
- Make every home route card open a route-detail screen backed by shared route data rather than a Ronkonkoma-only path.
- Add a Route Results screen reached by selecting a search match, with editable origin and destination fields, leave-time and refresh controls, sorting preferences, recommended-first mock itineraries, route-segment badges, total fare, total duration, and next-ride timing.
- Add a placeholder profile/settings screen from the home profile control with basic account and settings rows including Sign out.
- Keep all new screens and interactions local and mock-data-driven; no live routing, payment, persistence, or authentication service is added.
- **BREAKING** Remove the standalone Node.js/Express server workspace, health endpoint, server tests, server-only dependencies, API environment examples, and mobile API-heartbeat integration.
- Update root scripts, dependency metadata, and contributor documentation so the Expo application runs independently and Firebase is identified as the future backend architecture.
- Preserve all existing visible React Native/Expo behavior and defer Firebase SDK configuration, authentication, Firestore, Cloud Functions, Storage, and external API integrations to later changes.

## Capabilities

### New Capabilities

- `mobile-prototype-navigation`: Defines connected local prototype behavior for the adjustable map sheet, recent trips, shared route details, destination route results, and the placeholder profile/settings screen.
- `firebase-architecture-transition`: Defines the repository-level transition away from the obsolete standalone Express/MongoDB backend while preserving a runnable, backend-independent mobile prototype and documenting Firebase as the target architecture.

### Modified Capabilities

None. The repository currently has no archived main capability specs.

## Impact

- Affects mobile navigation state and presentation components under `mobile/src/components`.
- Extends local mock data under `mobile/src/data` for routes, recents, and trip itineraries.
- Generalizes the existing Ronkonkoma-specific detail presentation for multiple routes.
- Updates mobile interaction tests for search selection, route results, all route cards, sheet/map coordination, recents, and profile navigation.
- Removes the `server` workspace and its Express/CORS/TypeScript dependencies, health endpoint, tests, and build configuration.
- Removes obsolete API heartbeat code and API URL examples without changing visible mobile functionality.
- Simplifies root development and validation scripts to target the Expo workspace and updates the committed lockfile accordingly.
- Updates the README and configuration notes for a mobile-only local workflow and future Firebase services; it does not add Firebase runtime dependencies or implement Firebase functionality.
