# Proposal

## Why

The map backdrop is a handful of rotated rectangles and floating town labels. It doesn't look like a real map, and route lines on the detail screens are three disconnected bars. The rider supplied a reference (the Suffolk County Transit 51 around Stony Brook University) showing the look they want: a familiar street-map style with named roads, parks, a campus area, and a thick route line with white stop dots and a live vehicle marker. The app also has no dark appearance. The live-GPS signal is thin and static, so it doesn't read as live at a glance.

## What Changes

- **Illustrated street map:** replace `MapBackdrop` with a vector-drawn map in a street-map style. It has neutral land, white roads with street-name labels, green parks, a campus block, and water, laid out on approximate Stony Brook–area geography (for example Nicolls Rd, N Country Rd / 25A, Stony Brook University, the Setauket shoreline).
- **Route overlays:** route and trip detail maps draw each route as one thick, continuous polyline in the route color, with white-filled stop dots, a vehicle marker (a white circle with the mode icon and the live signal), and a destination pin. This replaces the rotated-rectangle segments.
- **Dark theme:** add Light / Dark / System appearance, chosen in Settings. Light is the default, and the choice is session-only like the other settings. Dark mode uses black and dark-gray surfaces, light text, and a dark map variant. Route identity colors and semantic success/warning colors are preserved. The status bar follows the active theme.
- **Live signal:** redraw the live-GPS signal with thicker, rounded-cap arcs and a gentle looping fade in and out. The fade stops when the app's Reduce motion setting or the device's reduce-motion preference is on.
- Settings that the prototype previously kept only inside the profile screen (appearance and reduce motion) move into an app-wide settings store, so every screen can react to them.

Already shipped outside this change: the trip action reads "END" instead of "END TRIP", and the Recents card no longer goes blank after ending a trip on Android.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-ui-design`:
  - Modify "Pathly visual palette" to cover light and dark themes.
  - Add requirements for appearance selection, the illustrated street map, and route map overlays.
- `mobile-prototype-navigation`: Modify "Live predictions use a wireless signal" for the thicker, animated signal.

## Impact

- **Dependency:** adds `react-native-svg`, installed with `npx expo install`. It is supported in Expo Go on Android, iOS, and web.
- **Code:**
  - Theme: `mobile/src/theme/*` gets a theme context and light/dark palettes.
  - Every component that uses `colors` moves to themed styles. There are 18 such files.
  - Map: `MapBackdrop.tsx` is rewritten. A new `RouteMapOverlay` component is used by `RouteDetailView` and `SharedTripDetailView`.
  - Other components: `LiveSignal.tsx` and the `ProfileView` settings.
  - App shell: `App.tsx` gets the providers.
  - Config: `app.json` changes `userInterfaceStyle` to `automatic`, so System mode can see the device theme.
- **Tests:** the existing theme test keeps the documented light palette. New tests cover theme switching, reduce motion, and the map overlay.
- **Unchanged:** navigation, test IDs, and mock data scope. Route geography is illustrative, not survey-accurate.
