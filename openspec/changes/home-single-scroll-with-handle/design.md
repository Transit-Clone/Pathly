# Design

## Context

`TransitSheet` is a full-screen `Animated.ScrollView` (`pointerEvents="box-none"`) layered over `GoogleMapView`. Its content is:
- a transparent `transit-map-window` spacer of `mapHeight`;
- the sheet (handle, tabs, cards).

`HomeScreen` sizes `mapHeight` so the tabs plus `VISIBLE_TRANSIT_CARDS` cards fit below it. It passes a `homeScrollY` `Animated.Value` that drives the location button's fade and translate.

## Goals / Non-Goals

**Goals:** one page scroll, a usable handle, three cards at rest, and the map still interactive.

**Non-Goals:** snap points, drag-to-dismiss, and changes to the cards or tabs.

## Decisions

1. **Handle inside the scroll content.** The handle is the first child of the sheet, so a native drag on it simply scrolls the page. No PanResponder is needed, which also avoids the react-native-web responder problems noted in the old sheet code. A `PressableScale` gives the handle a tap action, which is how web mouse users can expand the menu, since mouse drags don't scroll there.
2. **Tap toggles via `scrollTo`.**
   - Expanded offset = `mapHeight − 80` (just below the fixed header).
   - The page can only scroll as far as its content allows, so on tall windows it stops short of that offset. The sheet is deliberately not padded taller to reach the header; the user preferred the shorter expansion.
   - Tapping scrolls to the expanded offset if the page is at rest (offset ≤ 8 pt), otherwise back to 0. The animation is skipped when reduced motion is on.
   - The tap records its target as the current offset. Otherwise a page that stopped short could read as "near rest" and keep re-expanding: that was the original bug with a half-way threshold.
   - The current offset also comes from a `scrollY` listener set up in an effect, which catches manual scrolling. Reading a ref inside `Animated.event` during render is rejected by the React Compiler lint rule, and the listener isn't reliable for natively driven values, which is why the tap records its target itself.
3. **Touch pass-through.** Both the scroll view and its `contentContainerStyle` use `pointerEvents: 'box-none'`. On react-native-web the content wrapper is a plain `View` covering the map window and would otherwise swallow drags.
4. **Three cards at rest.** `VISIBLE_TRANSIT_CARDS` is set back to 3, and the Nearby, Recents, and Favorites content again has `minHeight = allNearbyRoutes.length × 104`, so every tab keeps the page scrollable (how far depends on the window height; see decision 2).

## Risks / Trade-offs

- [Android `ScrollView` pass-through with `box-none` can be inconsistent] → Verify map panning on a dev build. The same risk is tracked in `refine-route-detail-ui`.
- [The tap-toggle threshold uses the last reported offset, which may lag during a fling] → This is acceptable for a toggle. A tap during momentum just picks the nearer target.
