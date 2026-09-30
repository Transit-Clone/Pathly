# Design

## Context

See proposal.md for motivation, and the spec deltas for the required behavior. The current state that shapes this design:

- **Static styles.** 18 files import a static `colors` object and build their styles with module-level `StyleSheet.create`. Several also use `colors.*` inline in JSX. Nothing can change at runtime.
- **Settings.** `ProfileView` keeps every setting, including "Reduce motion", in local component state. The rest of the app can't see it.
- **Map.** `MapBackdrop` is absolute-positioned rotated Views and Texts. It is rendered full-bleed on the home, search, and results screens, and inside the fixed map layer of the detail screens (`DetailMapPage`). Route and trip details draw their route as rotated View bars at hard-coded percentage positions, and the stops sit at unrelated percentage positions.
- **Location marker.** Home overlays `CurrentLocationMarker` at a percentage position that has no relationship to map content.
- **Live signal.** `LiveSignal` is two 1.5 px bordered half-rings, drawn with Views and rotated 45°. Its hidden-element test ID `live-gps-signal` is counted in tests (5 on home).
- **Dark mode config.** `app.json` sets `userInterfaceStyle: "light"`, so native `useColorScheme()` always reports light.
- **Tests.** `theme.test.ts` asserts the six documented light colors on the exported `colors` object.

## Goals / Non-Goals

**Goals:**
- One source of truth for theme and motion preferences that every screen reads.
- A mechanical, low-risk conversion of existing styles to themed styles.
- One shared vector map that both the backdrop and the route overlays draw into, so routes line up with streets.

**Non-Goals:**
- A real map SDK, panning or zooming, or survey-accurate geometry.
- Persisting settings across reloads. This matches the other prototype settings.
- A high-contrast theme. The existing toggle stays cosmetic.
- Changing route identity colors per theme.

## Decisions

### 1. Settings and theme context
`AppSettingsProvider` (in `src/theme/AppSettings.tsx`) holds `appearance: 'light' | 'dark' | 'system'` (default `'light'`) and `reducedMotion: boolean`. It resolves the scheme with RN's `useColorScheme()` for System mode, and combines the app toggle with `AccessibilityInfo.isReduceMotionEnabled()` plus its change listener.

It exposes:
- `useAppSettings()`, which returns the values and their setters.
- `useTheme()`, which returns `{ scheme, isDark, colors }`.

`App.tsx` wraps `HomeScreen` in the provider. `app.json` changes to `userInterfaceStyle: "automatic"`.
- *Alternative considered:* the Appearance API alone. It cannot express an in-app override that differs from the device setting.

### 2. Palettes
`src/theme/colors.ts` exports a `Palette` type:
- `lightColors`, which holds today's values unchanged. `colors` is kept as an alias, so the documented-palette test and non-component code still work.
- `darkColors`, which has the same keys.

Dark values:
| Tokens | Value |
| --- | --- |
| background / canvas | `#000000` / `#0D0E10` |
| surface | `#1B1C1F` |
| border | `#2E3137` |
| ink / text | `#F2F4F7` |
| mutedInk | `#A0A8B4` |
| primary | `#5B9BF8` |
| blueSoft | `#14263D` |
| greenSoft | `#10281A` |
| redSoft | `#34161A` |
| amberSoft | `#35210F` |
| shadow | `#000000` |

`white` stays `#FFFFFF`, because it is used as text on route-colored fills. A new `onPrimary` token is `#FFFFFF` in light and `#0A1B30` in dark, so text on primary-filled buttons keeps at least 4.5:1 contrast. Map tokens are added to both palettes:
- `mapLand`, `mapRoad`, `mapRoadMajor`, `mapRoadCasing`
- `mapPark`, `mapCampus`, `mapWater`
- `mapLabel`, `mapLabelHalo`

A unit test computes WCAG contrast for `ink`, `mutedInk`, and `primary` against `background` and `surface`, and for `onPrimary` against `primary`, in both palettes (at least 4.5:1).

### 3. Mechanical style conversion
Each component changes `const styles = StyleSheet.create({...})` to `const createStyles = (colors: Palette) => StyleSheet.create({...})`. It then calls a `useThemedStyles(createStyles)` hook, which memoizes the result per palette, in every component function that uses `styles`. It also reads `const { colors } = useTheme()` for any inline color references.

Style keys and test IDs do not change. `StatusBar` uses `isDark ? 'light' : 'dark'`. `Switch` track and thumb colors, `TextInput` placeholder and selection colors, and the Modal backdrop are themed too.
- *Alternative considered:* CSS-variable-like dynamic `PlatformColor`. It isn't portable to web and doesn't support an in-app override.

### 4. Appearance in Settings
A new `appearance` settings row (Preferences group, `palette` icon) opens a page with a `ChoiceRow` offering Light / Dark / System (test IDs `appearance-light`, `appearance-dark`, `appearance-system`). The Accessibility page's Reduce motion toggle is re-pointed at `useAppSettings().reducedMotion` instead of local toggle state. Other toggles stay local.

### 5. Vector map with a shared world coordinate space
Add `react-native-svg` (installed with `npx expo install`). The geometry lives in `src/data/mapGeometry.ts`, in a fixed world space of 1000 × 1400 units. It holds:
- road polylines, each with a class (`major` or `minor`) and an optional name and label anchor
- park, campus, and water polygons
- a named `userLocation` point at Stony Brook University

Roads are loosely based on the Stony Brook area. They include Nicolls Rd, N Country Rd (25A), Stony Brook Rd, Main St, Quaker Path, Christian Ave, Hallock Rd, and Pond Path, with the Setauket Harbor shoreline as water.

`MapBackdrop` renders an `<Svg>` that fills its parent, with a `viewBox` computed from an optional `focus` bounding box. When there is no focus, it shows a default region around the campus. `preserveAspectRatio="xMidYMid slice"` means the map fills the container without distortion. An `onLayout` measurement gives the pixel scale, so road widths and label font sizes are expressed in pixels (divided by scale) and stay the same visual size at any zoom.

Each road draws in two passes: a casing stroke, then the fill stroke. Road names are drawn as `<Text>` along the label anchor, rotated to the road's angle, with a halo stroke. The optional `children` render inside the same `<Svg>`, which is how overlays share the coordinate space. `showUserLocation` draws the pulsing-halo user dot at the `userLocation` point. On home, this replaces the percentage-positioned `CurrentLocationMarker`.
- *Alternative considered:* keeping Views and adding more roads. Views can't draw curved polylines or text along roads, and they can't share coordinates with overlays.

### 6. Route and trip overlays
Each `RouteDetail` gains `mapPath: [x, y][]` in world units, and a `mapStops` array giving the index of each `mapLabels` entry along that path. Leg data gains `routeId`: it is added to `RecentTripLeg` fixtures and to `TripDetailLeg`, and the planned wrapper sets it from its segments, which are `RouteDetail` objects.

`RouteMapOverlay` (SVG children for `MapBackdrop`) draws the route as follows:
- the path as a casing stroke (white in light, black in dark) followed by a thick route-color stroke with round joins and caps
- white-filled stop circles with route-color rings, and stop-name labels with halos
- for route detail, a vehicle marker at the path midpoint

The vehicle marker is a white circle (surface in dark) with the mode `Icon` and a `LiveSignal`, plus the minutes bubble. SVG can't host arbitrary React Native views, so those pieces are a React Native `View` that is absolutely positioned with the same world-to-pixel transform that `MapBackdrop` exposes through an `onProjection` callback.

Trip overlays draw each leg's route path in its color. They add a dashed gray walking connector between the end of one leg and the start of the next, a start ring on the first stop, and a destination pin at the final stop. Detail screens pass `focus` set to the overlay's bounding box, padded 12%. The map layer's top controls cover the top of the map, so the box is biased downward by the controls' height.

The old rotated-bar styles and percentage-based `stopPositions` in `RouteDetailView` and `SharedTripDetailView` are removed.

### 7. LiveSignal
`LiveSignal` is redrawn with `react-native-svg` as two concentric quarter-arcs, stroke width 2.4 in a 14 × 14 box, with `strokeLinecap="round"` and no source dot. Each arc is its own SVG inside an `Animated.View`, and its opacity loops 1 → 0.25 → 1 over 1.8 s (`Animated.loop` with `useNativeDriver` except on web). The outer arc starts 450 ms after the inner arc, so the arcs blink in turn. When `useAppSettings().reducedMotionActive` is true, the loops stop and both arcs are set to opacity 1. Callers position the signal: time rows put a spacer the signal's width (`LIVE_SIGNAL_WIDTH`) on the left of the number, so the number stays centered over `minutes`.

The test ID and accessibility hiding are unchanged. Position props keep the signal at the upper-right of the numeral, as it is today.

## Risks / Trade-offs

- [The 18-file style conversion is broad] → The conversion is mechanical, with keys and test IDs unchanged. The full Jest suite runs after each batch, and a dark-mode smoke test renders home, results, a route detail, a trip detail, and profile under Dark.
- [`react-native-svg` in Jest] → `jest-expo` transforms it. If rendering fails, mock `react-native-svg` primitives to Views in `jest.setup.js`, as was done for the icons.
- [SVG text rendering cost on low-end Android] → Only about 15 labels are drawn, and the backdrop is memoized per theme and viewBox.
- [Animated loops on every live signal] → A native-driver opacity animation is cheap. Reduce motion disables it.
- [Illustrative geography may be questioned for accuracy] → The map is documented as illustrative in the proposal. Real geodata is deferred to a real map SDK.
- [System mode in Expo Go] → Expo Go honors `userInterfaceStyle: automatic` after the project reloads. This is covered in the emulator pass.

### 8. Readable route-colored text
`theme/contrast.ts` provides `readableColor(color, background)`, which blends a route color toward white (on dark backgrounds) or black (on light ones) in 5% steps until it reaches 4.5:1 contrast. Route detail uses it for route-colored text and icons only in dark mode. Route lines, fills, and badges keep the exact route color.

### 9. Interaction motion
`theme/motion.tsx` holds the shared motion primitives:
- `ScreenTransition` fades and settles a screen in over 220 ms when it mounts. `HomeScreen` keys it by the active view, and the results list, planned trip, and settings pages key it locally, so screen state is preserved.
- `useLayoutEase()` calls `LayoutAnimation.configureNext` (200 ms ease-in-out, opacity) before alert, panel, filter, and tab-content changes.
- `PressableScale` replaces style-callback `Pressable`s app-wide. It springs scale (0.97) and opacity (0.78) on press-in and press-out with the native driver.
- The home tabs draw a single `Animated.View` underline that springs to the selected tab's offset.

Every primitive reads `reducedMotionActive` and does nothing (or jumps straight to the end state) when it is set.
