# Design

## Context

See `proposal.md` for motivation and `specs/mobile-prototype-navigation/spec.md` for observable behavior. The current Expo prototype uses one `HomeScreen` state union for home, search, and a Ronkonkoma-specific route view. Search rows are non-interactive, only the pinned route receives an `onPress`, the Recents and Favorites tabs share an empty state, and the home location button is positioned from the compact sheet height rather than its animated position.

The prototype has no navigation dependency and all visible transit content is local mock data. This change should preserve that lightweight architecture while making the new flows explicit and testable.

## Goals / Non-Goals

**Goals:**

- Connect home, search, route results, generic route details, recents, and profile through typed local navigation state.
- Reuse shared visual primitives and structured mock data rather than cloning screens for each route or itinerary.
- Coordinate the animated home sheet with map controls across minimized, compact, and expanded states.
- Preserve accessible labels, 44-pixel controls, Android back behavior, and current visual language.

**Non-Goals:**

- Introduce a navigation package, backend route planner, real transit feeds, geocoding, fares, payments, or account services.
- Persist pins, recents, trip criteria, preferences, or profile settings between launches.
- Model every agency-specific service rule or produce geographically authoritative itineraries.

## Decisions

### 1. Use typed screen state at the prototype root

Extend the existing root screen state with payload-bearing route detail and route-results variants plus a profile variant. Back actions return to the immediately relevant parent: route details and profile return home, while Route Results returns to destination search. Android hardware Back follows the same transitions.

Alternative considered: add React Navigation. Rejected because the prototype has a small, fixed screen graph and no deep links or persisted stacks; a new dependency would add more infrastructure than the local flows require.

### 2. Generalize route data and route detail rendering

Create a stable route identifier and a shared route-detail record containing agency, names, color, directions, predictions, map labels, stops, and service-alert state. Home cards pass the selected route identifier upward. Replace the Ronkonkoma-only view with a generic route view, retaining route-specific test identifiers where useful for compatibility.

Alternative considered: add separate detail components for S1, E, 51, and 7. Rejected because their structure and interactions are identical and duplicated markup would drift.

### 3. Represent sheet position as three snap points

The sheet uses minimized, compact, and expanded heights and reports its current animated/snap state to the home screen. Minimized leaves only a small handle lip above the bottom safe area, compact shows tabs and initial cards, and expanded reveals more content. The floating map location button is positioned above the minimized/compact sheet and fades or unmounts at expanded state so it cannot overlap content.

Alternative considered: continuously move the location button with every animation frame. Rejected because it couples two animations and can visually jitter; responding to the settled snap state is simpler and sufficient.

### 4. Draw the live indicator as a code-native two-arc glyph

Replace the three vertical bars with two nested bordered arcs and a small source dot, absolutely anchored to the upper-right of the numeric time group. Continue rendering it only for live predictions. This avoids introducing an image asset and keeps color adaptable across route backgrounds and light prediction tiles.

### 5. Add destination-oriented recent trip cards

Use a small local recent-trip dataset with destination, origin, route badges, and recency text. The Recents tab renders compact selectable rows that open the same Route Results view as search selection. Favorites remains a placeholder because the request does not define saved-place behavior.

### 6. Build Route Results from structured mock itineraries

Use destination-independent mock itinerary records containing recommendation, preference tags, ordered route segments, fare, duration, next-departure copy, and simple timeline proportions. Filter/sort these records locally by the selected preference while always placing recommended matches first. Origin and destination use controlled text fields; the destination is initialized from the selected search place.

The leave-time control cycles through a few clear local labels such as `Leave now` and a later time. Refresh updates a visible `Updated now` indicator or lightweight rotation state without changing endpoints or calling the network.

Alternative considered: compute routes from route/stop graphs. Rejected because the current mock data is not a routable network and such computation would imply accuracy the prototype cannot provide.

### 7. Keep profile settings deliberately inert

The profile screen uses static account summary and settings rows with chevrons or switches where useful. Sign out provides pressed/local feedback only and is clearly a placeholder; it does not mutate credentials or navigation state beyond optional feedback.

## Risks / Trade-offs

- **Three-way sheet gestures can select the wrong bound** → Clamp height continuously and snap to the nearest of the three measured heights using projected velocity.
- **Horizontal card paging can conflict with vertical list or sheet dragging** → Keep sheet drag ownership on the handle and route-direction paging inside each card.
- **Generic route data can become verbose** → Keep a compact typed mock model and derive presentation labels where possible.
- **Mock trip results may be mistaken for live guidance** → Label results as prototype recommendations and avoid claims of live accuracy.
- **Editable fields could imply full address search** → Treat them as local controlled fields and keep route cards deterministic for the prototype.
- **Added screens increase root-state complexity** → Centralize view transitions in `HomeScreen` and keep each child screen stateless except for its own local controls.

## Migration Plan

1. Extend shared route, recent-trip, and itinerary mock data with stable identifiers.
2. Replace the live signal primitive and update home/detail placement.
3. Add three-state sheet behavior and location-control coordination.
4. Generalize route details and wire every card.
5. Add Recent trip rows and their Route Results transition.
6. Make search rows selectable and add Route Results with local controls and itinerary cards.
7. Add the placeholder profile/settings screen and wire the profile control.
8. Update interaction tests, run the full workspace validation suite, and exercise all new paths in Android.

Rollback is limited to reverting mobile components, mock data, and tests. No server or persisted-data migration is required.
