# Design

## Context

- `RouteDetailView.tsx`:
  - Computes `hasDelay = !route.alert.startsWith('No delays')` but always renders the "Service alerts" row, showing "No delays" or "Advisory".
  - `route.alert` is static mock text in `transit.ts`. Only `s1` has an advisory; `ronkonkoma` (Port Jefferson Branch) says "No delays reported on this route."
  - Timeline rows render `stopName` plus a `stopMeta` caption ("Departs" / "Final stop" / "Scheduled stop").
  - Scheduled tiles use `predictionSource`: plain 8 pt muted text, absolutely positioned, on a tile already at 0.68 opacity.
- Only `ronkonkoma` renders `LirrRouteMap` (a real Google map). Other routes render the illustrated `MapBackdrop`.
- `LirrRouteMap`:
  - Native (`react-native-maps`) and web (`@react-google-maps/api`) both use default `Marker`s for the 22 stations (red pins) and a hard-coded `#A626AA` polyline.
  - Web also sets `disableDefaultUI`.
- `DetailMapPage` wraps the map in `<View pointerEvents="none">`. A full-screen `Animated.ScrollView` sits on top of it, starting with a transparent `map-window` spacer (`pointerEvents="box-none"`) that holds the route controls. Nothing can reach the map.

## Goals / Non-Goals

**Goals:**
- Make the live map pannable and zoomable in place without breaking page scrolling or the on-map controls.
- Make stations legible as stops (white dots in the route color) with names on tap.
- Small, contained visual cleanups to alerts, timeline, and the Scheduled label.

**Non-Goals:**
- Real service-alert data (alerts stay mock; only their visibility changes).
- Interactive illustrated maps, interactive trip-detail maps, or real maps for other routes.
- A full-screen map mode.

## Decisions

1. **Alert row only when `hasDelay`.** The existing prefix check is kept as the "has advisory" signal, since that's all the mock data supports. When there's no advisory, the row and body are not rendered. The expand/collapse behavior with an advisory is unchanged.
2. **Timeline captions removed.** The `stopMeta` `<Text>` and its style are deleted. The row's `accessibilityLabel` already says "departs" or "arrives" and stays as is.
3. **Scheduled pill.**
   - `predictionSource` gets horizontal padding, a full border radius, `overflow: 'hidden'` (needed for rounded `Text` backgrounds on iOS), a `colors.mutedInk` background, and `colors.surface` text.
   - It keeps its absolute `bottom` position, so number and `minutes` alignment is unchanged.
   - A neutral filled pill reads on both white tiles and the route-colored first tile, in both themes.
   - The tile-level 0.68 opacity is left as is.
4. **Opt-in interactive map in `DetailMapPage`.** A new `interactiveMap` prop:
   - The map container uses `pointerEvents="auto"` instead of `"none"`.
   - The `Animated.ScrollView` gets `pointerEvents="box-none"`, so touches on its transparent `map-window` area fall through to the map. Touches on the content sheet and the controls still hit them. The scroll view's pan recognizer still scrolls when a drag starts on the content.
   - Only `RouteDetailView` passes `interactiveMap`, and only for the live route. Trip detail and illustrated routes keep the current behavior.
   - The route badge drawn over the map gets `pointerEvents="none"` so it doesn't block gestures.
   - *Alternative considered:* a tap-to-expand full-screen map. The user chose direct interaction instead.
   - *Alternative considered:* restructuring the page so the map is inside the scroll content. Rejected because it would move the map while scrolling, which breaks the "stationary backdrop" requirement.
5. **Web gestures.** `gestureHandling: 'greedy'` is added to the web map options, so one-finger drag pans on touch browsers and the scroll wheel zooms without Ctrl. Default UI stays disabled.
6. **Stop dots.**
   - *Native:* each station is a `Marker` with a custom child view: a 12 pt white circle with a 3 pt route-color border, `anchor={{ x: 0.5, y: 0.5 }}`, and `title={stop.name}`, so tapping shows the native callout.
   - Native `tracksViewChanges` starts `true` and flips to `false` after the first layout, which avoids blank custom markers on Android while not re-rendering all 22 markers every frame.
   - *Web:* `Marker` gets an `icon` of `google.maps.SymbolPath.CIRCLE` (white fill, route-color stroke, centered by definition) plus `title` for hover. Clicking shows a compact label above the dot (an `OverlayViewF` with the stop name), tracked by a `selectedStop` state; clicking the map closes it. Google's `InfoWindow` was dropped because its close button overlapped the stop name.
7. **Real track geometry.**
   - `portJeffersonShape.ts` is generated from `firebase/functions/static_data/lirr/shapes.txt`. It joins shape `91BE652D` (Penn Station → Huntington, the most common shape for route 10) with `DECD0CE9` (Huntington → Port Jefferson). LIRR runs the branch as two trip patterns split at Huntington, so no single shape covers it.
   - The joined 1,551 points are simplified with Douglas-Peucker at 4 m to about 230 points. That is visually identical at street zoom and small enough to bundle.
   - Stations stay in `portJeffersonGeometry.ts`, and only the polyline uses the shape.
   - *Alternative:* fetch shapes at runtime from the Cloud Function. Rejected because the shape is static, and bundling avoids a network call and a loading state.
8. **Train markers.** The default `Marker` is a red pin on web (and a blue pin on native), which looked like an unexplained place. Trains first became filled route-color circles, but next to the hollow stop dots riders read them as inconsistent station markers. Trains are now a 26 pt rounded-square badge in the route color, with a white border and a white train glyph, centered on the position. On native it's a custom view with the `rail` icon; on web it's an inline SVG data-URL icon with a higher `zIndex`. The different shape, not just the fill, separates trains from stations.
9. **Pill spacing and stop divider.**
   - Every prediction tile (live too) gets `paddingBottom: 22` and `minHeight: 126`. Centered content moves up equally on all tiles, keeping alignment, and the absolutely positioned pill (`bottom: 11`, padding 8×2) has clear space above it.
   - In the stop timeline, the bottom border moves from the name column to a `stopBody` row that wraps the name and the time, so the divider spans both.
10. **Route color.** `LirrRouteMap` takes a `color` prop (passed `route.color`) for both the polyline and the stop outlines, replacing the hard-coded `#A626AA`.

## Risks / Trade-offs

- [Android `ScrollView` and `pointerEvents="box-none"` pass-through has historically been inconsistent across React Native versions] → Verify on a real Android device. If it fails, fall back to making the `map-window` spacer non-scrolling by placing the scroll view below the uncovered map area while the page is at the top. That would be recorded as a design update.
- [Pinch or drag on the map area can no longer scroll the page] → This is the intended trade-off. The content below the map is always visible on open, so the rider can scroll from there.
- [Web scroll wheel over the map zooms instead of scrolling the page] → Same trade-off, and consistent with Google Maps embeds using greedy handling.
- [Mock alert data means the Port Jefferson Branch never shows alerts] → This is accurate to the current data and will change when real alerts are wired up.
