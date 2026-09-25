# Proposal

## Why

The current mobile prototype has the intended map-first structure, but its warm color system, default typography, and transit-information hierarchy do not match Pathly's documented visual direction. Aligning the existing screens now will establish a consistent, glanceable interface in which route names and arrival or departure times are immediately obvious without adding product scope.

## What Changes

- Apply the design document's Pathly palette across the existing mobile screens, including navy primary actions, light-blue accents, a cool near-white background, dark text, and distinct success and warning colors.
- Use Nunito consistently for visible mobile-interface text with a restrained weight and size hierarchy.
- Redesign nearby-transit cards as route-colored, icon-free surfaces where the route name and minute count share top visual priority, followed by direction and stop name.
- Distinguish live GPS-tracked predictions from scheduled times with a small GPS signal for live values and reduced opacity plus a `Scheduled` label for timetable values.
- Provide two directions for each nearby route through horizontal swiping without adding new destinations or backend data.
- Make the lower home sheet vertically draggable so users can reveal more routes while the map resizes and the search/profile controls remain fixed at the top.
- Replace route-detail clock-time selectors with multiple square-ish minute prediction tiles, add a service-alert control, keep route/map colors aligned, and add current-location and pin controls.
- Simplify repetitive headings, labels, chips, and decorative treatments across the home, search, and route-detail screens.
- Keep the prototype local and mock-data-driven; do not add route planning, authentication, persistence, real transit feeds, or new screens. The new swipe, drag, alert, location, and pin affordances are prototype UI interactions only.
- Treat `docs/Design.ipynb` as the current repository source of truth because the requested `docs/design.md` does not exist.

## Capabilities

### New Capabilities

- `mobile-ui-design`: Defines the visual system and information hierarchy for Pathly's existing home, search, transit-card, and route-detail interfaces.

### Modified Capabilities

None. The project has no existing OpenSpec capability specs.

## Impact

- Affects the React Native mobile presentation layer under `mobile/src/components` and `mobile/src/theme`.
- May add or configure a mobile font dependency or bundled font assets for Nunito.
- Requires updates to mobile UI tests where copy, hierarchy, or rendered structure changes.
- Extends mobile mock data and local presentation state for route directions, prediction provenance, sheet dragging, and visual controls without changing the Express server or API contracts.
