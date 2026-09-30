# Tasks

## 1. Theme and Settings Foundation

- [x] 1.1 Install `react-native-svg` with `npx expo install` and set `userInterfaceStyle` to `automatic` in `mobile/app.json`. Verify with `npm run typecheck` and confirm that a trivial `<Svg>` renders in Jest (add a `react-native-svg` mock to `jest.setup.js` only if it does not).
- [x] 1.2 Add `Palette`, `lightColors` (with `colors` kept as an alias), `darkColors`, the `onPrimary` token, and the map tokens to `mobile/src/theme/colors.ts`. Extend `theme.test.ts` with WCAG contrast checks of at least 4.5:1 for ink, mutedInk, and primary on background and surface, and for onPrimary on primary, in both palettes, while keeping the documented light-palette assertion.
- [x] 1.3 Create `AppSettingsProvider`, `useAppSettings`, `useTheme`, and `useThemedStyles`, covering appearance resolution with System via `useColorScheme` and reduced motion combining the app toggle with `AccessibilityInfo`. Wrap the app in `App.tsx`. Add tests for Light/Dark/System resolution and for combining reduced-motion sources.

## 2. Appearance Settings

- [x] 2.1 Add the Appearance settings row and page with the Light/Dark/System choice, and point the Accessibility "Reduce motion" toggle at app settings. Verify with a test that selecting Dark shows it as selected after leaving and reopening Settings, and that the home sheet then renders with the dark surface color.

## 3. Themed Components

- [x] 3.1 Convert the home surfaces (`HomeScreen`, `SearchHeader`, `TransitSheet`, `TransitCard`, `TripCard`, `CurrentLocationButton`, `CurrentLocationMarker`) to `useThemedStyles`/`useTheme`, with a status bar that follows the theme. Verify the full Jest suite passes and that a Dark smoke test asserts dark backgrounds on the sheet, tabs, and Recents cards while route cards keep their route colors.
- [x] 3.2 Convert search and results (`SearchView`, `RouteResultsView`, `LeaveTimeSheet`, `WheelColumn`), including input placeholder and selection colors and the Modal backdrop. Verify the suite passes and that a Dark smoke test covers the results sheet and an open time picker.
- [x] 3.3 Convert the detail and settings screens (`DetailMapPage`, `RouteDetailView`, `SharedTripDetailView`, `ProfileView` including its Switch colors). Verify the suite passes and that a Dark smoke test covers route detail, trip detail, and a settings page.

## 4. Illustrated Map

- [x] 4.1 Author `mobile/src/data/mapGeometry.ts` with a 1000×1400 world space, the named Stony Brook–area roads (major and minor) with label anchors, parks, the campus, water, and `userLocation`. Add a data test asserting that every named road has a label anchor inside world bounds.
- [x] 4.2 Rewrite `MapBackdrop` as a themed SVG with focus-based viewBox, `slice` fitting, pixel-constant road widths and labels via `onLayout` scale, SVG children, an `onProjection` callback, and `showUserLocation`. Replace home's percentage-positioned location marker. Verify with a test that the light and dark variants use their palette's `mapLand` fill and that the backdrop is hidden from accessibility.
- [x] 4.3 Add `mapPath` and `mapStops` to every route, and `routeId` to recent-trip legs, planned legs, and `TripDetailLeg`. Extend the data tests to assert that each path has at least 2 points, stop indices are in range, and every leg's `routeId` resolves.
- [x] 4.4 Build `RouteMapOverlay` for routes (casing and route stroke, stop dots and labels, vehicle marker with mode icon, live signal, and minutes bubble) and trips (per-leg strokes, dashed walking connectors, start ring, destination pin). Migrate `RouteDetailView` and `SharedTripDetailView` onto it with focus boxes, removing the rotated bars and `stopPositions`. Verify with tests that the route detail renders one route path with 5 stop markers and that the Times Square trip renders 2 leg paths, 1 connector, and a destination pin.

## 5. Live Signal

- [x] 5.1 Redraw `LiveSignal` as an SVG with thick, round-capped arcs and a source dot, and add the looping opacity pulse that stops under reduced motion (app toggle or device). Verify that the `live-gps-signal` count on home is unchanged, that `Animated.loop` starts when motion is allowed, and that the signal stays at opacity 1 with no loop when Reduce motion is on.

## 6. Integration Verification

- [x] 6.1 Run `npm run typecheck`, `npm run lint`, and `npm test` from the repo root, and resolve all regressions.
- [x] 6.2 Visual pass on the Android emulator in Light, Dark, and System modes (toggling the emulator's dark mode). Check home (map, labels, user location, sheet), search, results with the time picker, route 51 detail (compare against the reference image), the Times Square trip detail, Recents and Favorites, and Settings. Confirm the live signal pulses and stops with Reduce motion, and that nothing is unreadable, clipped, or misaligned.
- [x] 6.3 Run `npx openspec validate add-dark-theme-map-style-and-live-signal --strict` and confirm every scenario is covered by the automated tests or the visual pass.

## 7. Follow-up Refinements

- [x] 7.1 Make each live-signal arc blink independently, with no source dot and a 1.8 s cycle, and keep numbers centered over `minutes`; verify with a component test that two loops start when motion is allowed and both arcs stay at opacity 1 under Reduce motion, and check the centering on the emulator.
- [x] 7.2 Lighten route-colored text and icons on dark surfaces with `readableColor`; verify with a unit test that every route color reaches 4.5:1 on the dark surface and is unchanged in light mode.
- [x] 7.3 Add `PressableScale`, `ScreenTransition`, `useLayoutEase`, and the sliding tab indicator, all honoring reduced motion; verify with component tests that press springs and screen fades run when motion is allowed and are skipped under Reduce motion, and confirm the feel on the emulator.
