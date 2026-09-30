# Design

## Context

See `proposal.md` for motivation. `PlannedTripDetailView` has been substantially customized and is the visual baseline. `RecentTripDetailView` still uses an older fixed overlay sheet, while the home screen already demonstrates the desired continuous map-to-content page scroll. `ProfileView` currently owns four inert rows and sign-out feedback in a single component. Navigation is implemented as local discriminated state in `HomeScreen`, and all prototype content must remain deterministic and backend-independent.

## Goals / Non-Goals

**Goals:**

- Preserve the current planned-trip visual decisions while preventing planned and recent trip details from drifting apart again.
- Give both trip-detail variants the home screen's predictable, single-direction native scrolling model.
- Make settings deep enough for end-to-end prototype review with consistent navigation and accessible controls.
- Keep the implementation testable through stable screen, control, and content identifiers.

**Non-Goals:**

- Real authentication, account editing, notification scheduling, location permission requests, analytics, privacy exports, support messaging, or persistence across app launches.
- A production navigation dependency or remote settings schema.
- Redesigning nearby route details, route results, or the user's customized visual choices outside the shared trip-detail structure.

## Decisions

### Use shared trip-detail presentation primitives with variant view models

Extract the map controls, summary/timing region, anchored trip action, and route-leg card presentation into shared primitives or a shared layout component. Planned and recent wrappers will translate their existing `Itinerary` and `RecentTrip` data into a common display model and supply variant labels and actions.

This is preferred over copying the planned component because future visual changes would otherwise require synchronized edits across two large style blocks. It is also preferred over forcing both domain types into one data type because planned itineraries contain inferred timing while recent trips contain recorded per-leg timing and recency.

### Model trip details as one vertical page

Use one parent vertical scrolling surface containing a fixed-height map section followed by trip content, matching the home screen's map-to-list behavior. Place top map controls as overlays and anchor the Go/End action at the visible map/content boundary without implementing pan responders, snap positions, or competing nested vertical scroll views.

The action remains associated with the boundary visually; content receives enough spacing to avoid being obscured. Horizontal gestures, if introduced later, remain independent.

### Keep profile subnavigation inside the profile feature

Use a small typed settings-route state owned by the profile feature rather than expanding `HomeScreen` with every settings page. The profile hub opens a selected settings screen, each child returns to the hub, and the hub returns home. Shared headers, section cards, rows, toggles, selectors, and local feedback reduce repetition.

This preserves the prototype's dependency-free navigation approach while preventing the app-level view union from becoming a catalog of settings-only routes. A production navigator remains a later migration option.

### Use representative local settings data

Account details shows guest/profile identity and editable-looking local fields; Notifications exposes master, service-alert, trip-reminder, and disruption controls; Accessibility exposes text size, reduced motion, high contrast, and step-free routing; Privacy shows location/data controls and policy links; Travel preferences shows mode, walking, transfer, and accessibility preferences; Saved places supports Home/Work labels and local add/edit feedback; Help & About shows FAQs, support placeholder, version, terms, and privacy entries.

Controls update component state and display feedback, but screens label prototype-only consequences where a real system integration would otherwise be implied.

## Risks / Trade-offs

- [Shared layout abstraction could erase intentional differences] → Keep recent/planned copy, status, timing provenance, and actions in explicit variant adapters rather than conditional style forks inside low-level primitives.
- [Anchored actions can obscure content on short screens] → Derive boundary placement from the same map/header measurements and reserve equivalent content spacing; test a narrow mobile viewport.
- [One large settings component could become difficult to maintain] → Separate route definitions/data and reusable settings UI from individual screen renderers when the component passes a readable size threshold.
- [Local toggles may appear persistent] → Use prototype/guest context and feedback copy, reset naturally with component remount, and avoid success messages that claim remote or device changes.
- [Existing tests depend on legacy labels] → Preserve established test IDs and core start/end/back behavior while adding focused coverage for new structure.

## Migration Plan

1. Introduce shared trip-detail types and visual primitives without changing entry points.
2. Adapt the customized planned-trip screen to the shared scrolling layout and verify no visual regressions.
3. Adapt recent trips using recorded times and recent-specific context.
4. Expand the profile hub and local settings subnavigation.
5. Update regression tests, run mobile typecheck/lint/tests, and visually inspect planned, recent, and settings flows at phone width.

Rollback is file-local: restore the separate trip-detail components and original single-screen `ProfileView`; no persistent data migration is required.
