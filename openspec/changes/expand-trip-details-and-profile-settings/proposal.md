# Proposal

## Why

Planned and recent trip details currently use different visual structures and neither follows the continuous map-to-content scrolling behavior that already works well on the home screen. Profile settings are also limited to placeholder rows, leaving important prototype flows unavailable for design review before backend implementation begins.

## What Changes

- Make planned and recent trip details share the same map-first visual language, summary hierarchy, route-leg cards, map actions, and continuous page-scrolling behavior.
- Preserve the current customized `PlannedTripDetailView` as the visual source of truth while adapting recent-trip-specific copy, timing, completion state, and replay behavior.
- Keep the trip action anchored above the content boundary while the map and detail content move as one normal vertical page.
- Expand Profile & Settings into navigable local prototype screens for account details, notifications, accessibility, privacy, travel preferences, saved places, help/about, and sign-out feedback.
- Provide realistic controls, toggles, values, and confirmation feedback using deterministic component state without authentication, persistence, device permissions, or network services.
- Add regression coverage for trip-detail scrolling, shared hierarchy, recent-trip distinctions, settings navigation, controls, and back behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-ui-design`: Extend the established visual hierarchy and continuous map-to-content scrolling model to planned and recent trip-detail screens.
- `mobile-prototype-navigation`: Replace placeholder-only profile settings with navigable prototype settings flows and define consistent planned/recent trip-detail interactions.

## Impact

- Affects trip detail, profile/settings, home-level navigation state, local mock data, and mobile UI tests under `mobile/`.
- May introduce shared trip-detail presentation primitives or view-model helpers to avoid visual drift while retaining separate planned and recent wrappers where their behavior differs.
- Uses existing React Native, Expo, Nunito typography, and Pathly theme dependencies; no backend, account, permission, or network integration is added.
