# Proposal

## Why

Pathly can plan and display an itinerary, but pressing `GO` does not yet create a usable enroute experience: the app does not advance with the rider, survive a relaunch, or turn a finished trip into a Recent. A working, deterministic navigation flow is the highest-priority gap for the upcoming product demo and the minimum needed to make route planning feel complete.

## What Changes

- Add an active-navigation lifecycle entered from `GO`, with a current instruction, upcoming action or stop, remaining-stop count, and arrival estimate derived from the selected itinerary and foreground location updates.
- Advance walking, boarding, transit-stop, transfer, and arrival progress monotonically as the rider moves, while handling sparse itinerary data without inventing directions.
- Make the trip map follow the rider and visually distinguish completed, current, and upcoming route portions while preserving normal map exploration and re-centering controls.
- Persist a per-account resume reference and progress locally so an active trip can be rehydrated and resumed after an app relaunch without retaining restricted route-response content.
- Complete or end a trip into bounded local, provider-light trip history and populate Home's Recents from that history.
- Extend admin location tools with deterministic itinerary checkpoints so the same production progress logic can be demonstrated without physically traveling.
- Add focused unit, component, persistence, and end-to-end demo-flow coverage for the navigation lifecycle.
- Keep all current product surfaces enabled. Dynamic rerouting, background navigation/notifications, and automatic off-route recovery remain follow-up work rather than demo blockers.

## Capabilities

### New Capabilities

- `enroute-navigation`: Active-trip lifecycle, location-driven progress, relaunch recovery, completion, and local trip history.

### Modified Capabilities

- `mobile-prototype-navigation`: Starting an itinerary opens the active-navigation experience, and completed trips populate Recents.
- `mobile-ui-design`: Planned-trip presentation gains an enroute state whose instruction panel and map communicate live progress.
- `admin-debug-tools`: Mock location controls gain deterministic trip-checkpoint simulation for active itineraries.

## Impact

- Primarily affects the Expo mobile app's trip-detail/home navigation state, location and debug contexts, trip map renderers, and local persistence/data adapters.
- Adds versioned, per-account on-device resume/history records. The in-memory session freezes the selected itinerary, while persisted data is limited to user input, identifiers permitted for storage, Pathly-owned schedule metadata, and progress needed to rehydrate it; completed history excludes route geometry.
- Reuses the existing trip-planning API for resume rehydration. No Firestore-rule or public API migration is required unless implementation discovers that exact selected-departure recovery needs an additional opaque resume field.
- Extends existing mobile test fixtures and test suites. Existing search, route planning, transit, profile, admin, and backend behavior stays available.
