# Proposal

## Why

Pathly's controls use Unicode glyphs (`‹ ☆ ★ ◎ ◆ ↻ ◷ ⇅ ⌃ ⌄ ▣ ◉ ⌖ ×`) and hand-built View shapes as icons. These render with different weights, sizes, and baselines on Android, iOS, and web, and several (◆ for "pin", ▣ for a vehicle, ◉/◌ for settings) do not communicate their meaning. Route badges are re-implemented per screen with drifting sizes and shapes. Separately, route details and trip details put the map inside the scroll view, so the map image slides away, unlike the home screen, where the map stays fixed and the content scrolls over it.

## What Changes

- Adopt one vector icon set and a small `Icon` wrapper so every control, status, and empty state uses consistent, recognizable pictograms (back chevron, star/favorite, locate, bookmark/pin, refresh, clock, swap, chevrons, close, bus/train vehicle, alert, settings-row icons, search).
- Finish and standardize the in-progress shared `RouteBadge`: shape by mode (circle for subway bullets, rounded square for bus, labeled rail tag for LIRR), consistent size scale, contrast-safe text, and an optional mode glyph. Replace every remaining ad-hoc badge.
- Supply route agency explicitly in mock data for recent-trip legs instead of guessing it from `shortName` or route name text.
- Redesign the Recents tab cards: mode-shaped route badges joined by chevrons, the destination with "From origin", the board–alight time range with duration and fare, a recency chip, an icon Go/End button, and a highlighted in-progress state.
- Change route detail and planned/recent trip detail so the map stays stationary behind the page, and the detail content scrolls continuously over it, matching the home screen. Back, favorite/pin, and locate controls stay fixed and reachable, and so does the trip GO/END action.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-ui-design`: Add requirements for a consistent vector iconography system, a shared mode-aware route badge, a richer recent-trip card, and a stationary map backdrop with continuous content scrolling on route-detail and trip-detail screens.

## Impact

- Code: `mobile/src/components/*` (all screens with icons or badges), `mobile/src/components/RouteBadge.tsx` (finalized), a new `mobile/src/components/Icon.tsx`, `mobile/src/data/transit.ts` (agency on recent-trip legs), and tests under `mobile/__tests__/`.
- Dependency: adds `@expo/vector-icons` (installed with `npx expo install` to match Expo SDK 57). It is bundled in Expo Go and supports Android, iOS, and web with no native config.
- Existing test IDs, accessibility labels, navigation, and mock-only scope are preserved.
- Builds on the completed but unarchived `expand-trip-details-and-profile-settings` change. Its "Continuous trip-detail map scroll" behavior stays true; this change only makes the map stationary under that scroll.
