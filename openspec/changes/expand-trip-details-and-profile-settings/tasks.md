# Tasks

## 1. Shared Trip-Detail Foundation

- [x] 1.1 Define a shared trip-detail display model and reusable map controls, summary, timing, action, and route-leg presentation that preserve the current planned-trip styling; verify planned and recent adapters can represent every existing itinerary and recent-trip fixture without unsafe casts.
- [x] 1.2 Refactor planned-trip detail into one continuous map-to-content vertical page with its action anchored at the boundary and no draggable or nested vertical sheet behavior; verify regression tests cover initial map/content visibility, repeated same-direction scrolling, map restoration, favorite/location controls, and start/end behavior.

## 2. Recent Trip Detail

- [x] 2.1 Adapt recent-trip detail to the shared presentation while retaining recorded origin, destination, per-leg times, fare, duration, transfer count, recency, completed status, and replay action; verify each existing recent-trip fixture renders the expected historical values.
- [x] 2.2 Render every recent-trip leg as a separate route card and provide the same favorite and location feedback as planned trips; verify tests cover the multi-leg Times Square trip, distinct cards, map controls, Back navigation, and Go/End transitions.
- [x] 2.3 Apply the continuous map-to-content scrolling contract to recent trips and visually compare planned and recent variants at a narrow phone viewport; verify the action clears content, scrolling reveals legs without reversing direction, and upward scrolling restores the map.

## 3. Profile and Settings Prototype

- [x] 3.1 Expand the profile hub with grouped entries for Account details, Notifications, Accessibility, Privacy, Travel preferences, Saved places, and Help & About while preserving Back and Sign out; verify all rows are accessible buttons with stable identifiers.
- [x] 3.2 Implement reusable settings-page headers, cards, rows, toggles, selectors, local feedback, and profile-owned subnavigation; verify every child page returns to the hub and the hub returns home without adding backend calls.
- [x] 3.3 Implement Account details, Notifications, Accessibility, and Privacy prototype screens with representative values and local controls; verify tests exercise at least one state change per screen and confirm the UI does not claim persistence, permission changes, or remote updates.
- [x] 3.4 Implement Travel preferences, Saved places, and Help & About prototype screens with representative controls, local add/edit feedback, FAQ/support placeholders, version, terms, and privacy entries; verify tests cover navigation and representative interactions on all three screens.
- [x] 3.5 Preserve local-only sign-out behavior and provide clear prototype feedback for backend-dependent actions; verify no fetch or authentication call occurs while navigating or interacting with settings.

## 4. Integration Verification

- [x] 4.1 Run mobile typecheck, lint, and the full Jest suite and resolve all regressions.
- [x] 4.2 Perform a phone-width visual pass through planned trip, recent single-leg and multi-leg trips, every settings category, Back navigation, and active-trip transitions; verify content has no overlap, clipping, unreachable controls, or inconsistent Pathly styling.
- [x] 4.3 Run strict OpenSpec validation and confirm every requirement scenario is represented by automated coverage or the documented visual pass.
