# Tasks

## 1. Icon Foundation

- [x] 1.1 Install `@expo/vector-icons` with `npx expo install` and preload `Ionicons.font` in `App.tsx` `useFonts`; verify `npm run typecheck` passes and the existing App loading-screen test still passes.
- [x] 1.2 Create `mobile/src/components/Icon.tsx` with the semantic name union, outline/filled mapping, default size and color, and accessibility hiding; add a unit test verifying that a filled toggle renders the solid variant and that the icon is hidden from accessibility.

## 2. Route Badge and Mode Data

- [x] 2.1 Add `agency` to `RecentTripLeg` and every recent-trip fixture in `mobile/src/data/transit.ts`; extend `transit.test.ts` to assert that every recent-trip leg has an agency.
- [x] 2.2 Finalize `RouteBadge.tsx` with `transitModeForAgency`, fixed small/medium/large heights, a subway circle, a bus rounded square (with optional `withModeIcon`), a rail tag with the rail icon, and a `"<shortName> <mode>"` accessibility label; add tests covering each mode's label and shape.
- [x] 2.3 Remove the agency guessing from `TransitSheet` and `RecentTripDetailView` and pass leg agency from data; verify the Recents and recent-trip tests pass and that the badges announce the correct modes.

## 3. Stationary Map Detail Pages

- [x] 3.1 Create the `DetailMapPage` scaffold (fixed map layer, transparent scroll with a `mapHeight` spacer, opaque content sheet with viewport `minHeight`, fixed controls overlay, and an optional sticky animated action); add a test that the map layer is outside the scroll view and the spacer matches `mapHeight`.
- [x] 3.2 Migrate `RouteDetailView` onto `DetailMapPage` with its back, locate, and pin controls in the fixed overlay; verify the existing route-detail test IDs, direction pager, service alerts, and stop timeline tests pass, and that the map test ID is no longer a descendant of `route-detail-scroll`.
- [x] 3.3 Migrate `SharedTripDetailView` onto `DetailMapPage` with back, favorite, and locate in the fixed overlay and GO/END as the sticky boundary action; verify planned and recent trip tests (scroll, favorite, location, start/end) pass and the map is outside `*-scroll`.

## 4. Icon and Badge Replacement Across Screens

- [x] 4.1 Replace glyphs in the route and trip detail screens (back, locate, pin/bookmark, favorite star, alert status, expand/collapse chevrons, vehicle marker by mode, leg arrows) with `Icon`, and use large `RouteBadge` with a mode icon in step cards; verify the toggle tests assert the selected accessibility state.
- [x] 4.2 Replace glyphs in `RouteResultsView` (back, swap, refresh, clock, Modes/Filter pill icons, segment arrows) and `SearchHeader`/`SearchView` (search, clear, recent/place icons, profile person icon); verify the search and results tests pass with unchanged accessibility labels.
- [x] 4.3 Replace glyphs in `TransitSheet` (Favorites empty state), `CurrentLocationButton` (navigate icon), and `ProfileView` (back, settings-category icons, row chevrons); verify the home, favorites, and profile/settings tests pass.

## 5. Recents Card Redesign

- [x] 5.1 Rebuild the Recents card with the three-row layout (badges with chevrons and a recency chip; destination and origin; time range, duration, and fare with the icon Go button), keeping the `recent-trip-*` test IDs; add a test asserting the Times Square card shows both leg badges, `8:42 AM – 10:16 AM`, `94 min`, and `$17.15`.
- [x] 5.2 Add the in-progress styling (highlight, "In progress" chip, End button with icon); verify a test that pressing Go shows "In progress" and the End action, and that the Recents content keeps the shared minimum height.

## 6. Integration Verification

- [x] 6.1 Run `npm run typecheck`, `npm run lint`, and `npm test` from the repo root, and resolve all regressions.
- [x] 6.2 Visual pass on the Android emulator: home tabs (including the redesigned Recents cards), route detail, planned trip, recent single-leg and multi-leg trips, results, search, and profile. Confirm the map image stays still while the content scrolls over it, the controls and sticky GO/END stay reachable, the icons are aligned, and nothing overlaps or clips.
- [x] 6.3 Run `npx openspec validate refresh-icons-badges-and-detail-scroll --strict` and confirm every scenario is covered by the automated tests or the visual pass.

## 7. Follow-up Refinements

- [x] 7.1 Route view: remove the header bar, stack locate, favorite, and pin vertically at the top right, and let the controls scroll away with the map (`DetailMapPage` `showHeader` and `controlsScrollWithMap`); verify with a test that the controls are inside the route scroll view and no header renders.
- [x] 7.2 Route view: make the active destination the heading above the tiles, remove the map destination overlay, and give every tile the same layout with the number centered over `minutes`; verify the per-route test asserts the destination heading, and check tile alignment on the emulator.
- [x] 7.3 Draw the pin control as a Material Community Icons thumbtack; verify with a component test that the `pin` glyph renders from the supplemental family.
- [x] 7.4 Give the search sheet one heading style ("Recent" / "Matches" plus a place count) and remove its handle; verify with a test asserting both headings and the count label.

