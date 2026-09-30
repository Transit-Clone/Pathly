# Proposal

## Why

The main `mobile-prototype-navigation` spec still requires a draggable home sheet with minimized, compact, and expanded bounds and a sheet handle. The app replaced that design with one continuous map-to-transit scroll, which `mobile-ui-design` specifies in "Continuous home map-to-transit scroll" (no draggable bounds, snap states, or resize handle). The two requirements contradict each other, and the stale one describes behavior that no longer exists.

## What Changes

- Remove the requirement "Home map and sheet coordinate without obstruction" from `mobile-prototype-navigation`.
- Keep its still-true rule that the home screen has no large "Nearby transit" heading. That rule is already covered by "Concise screen presentation" and the continuous-scroll requirement in `mobile-ui-design`.
- No code or test changes. The app and tests already match the continuous-scroll behavior; the tests assert there is no sheet handle and no drag handlers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-prototype-navigation`: remove the obsolete draggable-sheet requirement.

## Impact

- Specs only: `openspec/specs/mobile-prototype-navigation/spec.md`, applied on archive.
- No runtime, dependency, or test impact.
