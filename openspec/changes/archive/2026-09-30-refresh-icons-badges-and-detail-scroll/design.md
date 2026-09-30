# Design

## Context

See proposal.md (Why) for motivation, and the spec delta for the requirements.

The current state that shapes this approach:

- **Home layout.** The home screen renders `MapBackdrop` as a fixed layer. `TransitSheet` is a full-screen, transparent `ScrollView` whose first child is a transparent `mapWindow` spacer of height `mapHeight`, followed by the opaque sheet. Scrolling moves only the sheet; the map never translates.
- **Detail layouts.** `RouteDetailView` and `SharedTripDetailView` put the map `View` as the first child *inside* their `ScrollView`, so the map scrolls away. `RouteDetailView` already keeps its top controls in a fixed overlay outside the scroll view. `SharedTripDetailView` renders its controls and its GO/END button inside the map, so they scroll away too.
- **Badge draft.** An uncommitted `RouteBadge.tsx` exists and is wired into four screens. It chooses its shape from `agency`, but `TransitSheet` and `RecentTripDetailView` guess the agency from `shortName` or route-name text, because `RecentTripLeg` has no `agency` field.
- **Icons and dependencies.** No icon package is installed. `@expo/vector-icons` ships with Expo Go for every platform, and `jest-expo` already transforms `@expo/*` packages.
- **Tests.** The tests query by `testID`, accessibility label, and visible text.

## Goals / Non-Goals

**Goals:**
- One `Icon` wrapper with a semantic name map, so screens never reference raw glyph names.
- One shared stationary-map page scaffold, used by both route detail and trip details.
- Preserve every existing `testID` and accessibility label unless a label becomes more descriptive; any such change is reflected in the tests.

**Non-Goals:**
- Refactoring the home screen onto the new scaffold. Its behavior already matches the spec, so it is left alone to limit risk.
- Replacing `LiveSignal` or `CurrentLocationMarker`. These are spec-defined, View-drawn map and prediction marks that already render consistently. They are not control icons.
- Adding route badges to nearby-transit cards. The existing spec requires those cards to omit a separate route icon.
- Changing font sizes. The existing small type is intentional and stays as is.
- Real map rendering, dark mode, or new navigation.

## Decisions

### 1. Icon source: `@expo/vector-icons` (Ionicons) behind a semantic `Icon` component
`Icon` accepts a `name` from a closed union (`back`, `favorite`, `locate`, `pin`, `refresh`, `time`, `swap`, `expand`, `collapse`, `close`, `search`, `alert`, `ok`, `bus`, `subway`, `rail`, `forward`, `filter`, `modes`, `person`, `bell`, `accessibility`, `privacy`, `travel`, `place`, `help`), an optional `filled` flag, `size` (default 22), and `color` (default `colors.primary`). Toggle icons map `filled` to Ionicons' solid variant (for example `star` / `star-outline`, `bookmark` / `bookmark-outline`, `navigate` / `navigate-outline`). Icons render with `accessibilityElementsHidden`, so the parent control's label is announced instead.

- *Why Ionicons:* it pairs outline and filled variants consistently, has transit glyphs (`bus`, `subway`, `train`), matches the rounded Nunito aesthetic, and ships with Expo.
- *Alternatives considered:* hand-authored SVGs with `react-native-svg` (more work, adds a native module, no benefit for a prototype); MaterialCommunityIcons (larger set with a heavier look and weaker outline/filled parity).
- Install with `npx expo install @expo/vector-icons` so the version matches SDK 57. Preload `Ionicons.font` in `App.tsx` `useFonts` so icons do not pop in after the Nunito fonts.

### 2. Route mode from data, not inference
Add `agency` to `RecentTripLeg` and populate it in mock data. Export `transitModeForAgency(agency): 'subway' | 'bus' | 'rail'` from `RouteBadge.tsx`: `MTA Subway` → subway, `LIRR` → rail, everything else → bus. Delete the `shortName`/route-name guessing in `TransitSheet` and `RecentTripDetailView`.

### 3. RouteBadge shapes and sizes
The sizes are fixed at small 28, medium 36, and large 46 px high. Subway badges are circles (aspect ratio 1). Bus badges are rounded squares (radius about 0.25 × height) that widen for multi-character names. Rail badges are a rectangular tag with radius 4 containing the rail icon and the short name, so "R" (Ronkonkoma) does not look like the R subway bullet. Text is Nunito ExtraBold in white, scaled per size. Each badge's accessibility label is `"<shortName> <train|bus|rail>"`. An optional `withModeIcon` prop shows the mode glyph before the name on bus badges at large size (step cards and the route map).

### 4. Stationary-map scaffold: `DetailMapPage`
There is one component with the following layer stack:
1. An absolute map layer at the top, `height = mapHeight`, holding the map children (backdrop, route lines, stops, markers). It never moves.
2. An absolute, full-screen, transparent `ScrollView` (`bounces={false}`, `overScrollMode="never"`). Its first child is a transparent spacer `View` of `mapHeight` (the same technique as the home `mapWindow`). The opaque rounded content sheet follows, with a `minHeight` that fills the viewport, so the page can always scroll far enough to cover the map.
3. A fixed `SafeAreaView` overlay for the top controls (`pointerEvents="box-none"`).
4. An optional floating action, described in decision 5.

The props are `mapHeight`, `map`, `controls`, `action`, `children`, and the test IDs (`scrollTestID`, `mapTestID`, `contentTestID`). Both detail screens migrate to it, and the existing `*-map`, `*-scroll`, and `*-content` test IDs stay on the equivalent elements.

- *Alternative considered:* translating the map with an `Animated` parallax factor of 0. That adds work each frame for no gain, and the spacer technique is already proven on home.
- *Touch trade-off:* the spacer sits over the map, so the map receives no taps. The map has no interactive elements other than the controls, which sit above the scroll layer.

**Route-view variant (follow-up).** `DetailMapPage` takes two options. `showHeader` (default on) fades a surface bar in behind fixed controls once the sheet reaches the top. `controlsScrollWithMap` renders the controls inside the scroll view's map-window spacer, padded by the top safe-area inset, so they scroll away with the map. Trip details use the defaults. Route detail turns the header off and lets its controls scroll away: a back button on the left and a vertical column of locate, favorite, and pin on the right. The route detail page also drops the destination overlay on the map. The destination becomes the heading above the prediction tiles. The tiles center the number over `minutes` with a signal-width spacer on the left, and position `Scheduled` absolutely at the bottom so it never moves the number.

### 5. Trip action: sticky at the content boundary
The earlier trip-detail requirement anchors GO/END immediately above the content boundary, and the new spec needs it reachable at every scroll position. The action is rendered in the fixed overlay layer and positioned with an `Animated` `translateY` driven by the scroll offset: `translateY = clamp(mapHeight - scrollY - buttonOffset, minTop, ∞)`. Here `minTop` sits just below the top controls row, where the right-hand controls are, so it does not overlap them. The button rides with the sheet edge until it would pass under the top bar, then sticks. The animation uses `Animated.event` with `useNativeDriver: Platform.OS !== 'web'`.

- *Alternative considered:* a static bottom floating button. It is simpler, but it breaks the existing "anchored above the content boundary" requirement from the prior change.

### 5a. Thumbtack glyph
Ionicons' `pin` reads as a map pin, not a thumbtack. `Icon` keeps Ionicons as its primary family and adds a small `materialGlyphs` map that draws `pin` from Material Community Icons (`pin` / `pin-outline`). Both fonts are preloaded in `App.tsx`. The Jest setup mocks both families.

### 6. Recents card layout
Each card is a rounded surface (radius 16, 1 px border) with three rows:
1. Leg `RouteBadge`s (small) separated by `forward` chevron icons, then a recency chip on the right (`time` icon plus recency text).
2. The destination (bodyStrong 15), then `From <origin>` (metadata).
3. `<first boardTime> – <last alightTime> · <duration> min · <fare>`, then the Go/End button on the right (`navigate` icon plus "Go", or `stop` icon plus "End").

The active state uses the `greenSoft` background, a 4 px left accent in `success`, and an "In progress" chip. The existing `recent-trip-<id>`, `recent-trip-go-<id>`, and `recent-trip-end-<id>` test IDs and accessibility labels are kept. The shared `TAB_CONTENT_MIN_HEIGHT` stays unchanged. Existing font sizes are reused.

## Risks / Trade-offs

- [Icon font not loaded on first frame] → Preload `Ionicons.font` alongside the Nunito fonts in `App.tsx`. The existing loading screen already covers the wait.
- [Jest rendering of `@expo/vector-icons`] → `jest-expo` supports it. If a font-loading warning appears, mock `expo-font`'s `isLoaded` in the test setup instead of changing the component.
- [Sticky action overlapping the favorite and locate controls on short screens] → Clamp `minTop` below the controls row, which is measured from the safe-area inset plus the control height (48) plus spacing.
- [Nested horizontal direction pager inside the scroll-over sheet] → This is unchanged. The pager stays inside the sheet, just as `TransitCard` pagers sit inside the home sheet.
- [Web scroll events with the native driver] → `useNativeDriver` is disabled on web.

## Migration Plan

This is a UI-only change with no data migration. Roll back by reverting the commit and uninstalling `@expo/vector-icons`.
