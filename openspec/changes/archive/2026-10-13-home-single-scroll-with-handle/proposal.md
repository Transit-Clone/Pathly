# Proposal

## Why

The home screen is moving from a draggable transit sheet with an inner list to one continuous page that scrolls over a stationary map, which matches the existing "Continuous home map-to-transit scroll" requirement. The first pass of that redesign had three problems:
- It crashed on load because `mapHeight` was used before it was declared.
- It blocked map panning because the scroll view's content wrapper caught every drag over the map.
- It removed the handle and showed only one card at rest.

The user wants the single-scroll page, but with a handle and at least three cards visible at rest.

## What Changes

- **Single page scroll:** the transit menu scrolls over a stationary full-screen map in one page scroll (no draggable sheet bounds or snapping).
- **Handle:** a handle sits above the tabs. Dragging it scrolls the page like the rest of the menu. Tapping it (or clicking on web) at rest scrolls the menu up toward the search header, as far as its content allows. The next tap always returns it to the initial resting position.
- **At rest:** the handle, the tabs, and at least three complete transit cards are visible, and the Nearby list keeps its minimum height.
- **Map gestures:** the uncovered map area stays pannable and zoomable. The scroll view and its content wrapper pass touches through outside the menu.
- **Location button:** the current-location control fades and moves up with the page as it scrolls.
- **Fixes:** the `mapHeight` declaration-order crash and the leftover unused `useNativeDriver` import.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-ui-design`: "Continuous home map-to-transit scroll" now requires the handle and its tap-to-expand behavior, at least three cards at rest, map gestures outside the menu, and the scrolling location control.

## Impact

- **Code**: `mobile/src/components/HomeScreen.tsx` and `mobile/src/components/TransitSheet.tsx`.
- **Tests**: two assertions in `mobile/__tests__/App.test.tsx` that checked the old sheet structure now check the single-scroll equivalent:
  - a `transit-map-window` height instead of the sheet's `top`;
  - no filler sizing instead of no content style at all.
  - The handle and Nearby minimum-height tests are unchanged.
- **Dependencies**: none.
