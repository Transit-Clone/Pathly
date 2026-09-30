# Tasks

## 1. Shared Mock Models and Live Indicator

- [x] 1.1 Introduce stable route identifiers and shared detail records for Ronkonkoma, S1, E, 51, and 7, plus recent-trip and itinerary mock models; verify focused data tests cover unique IDs, two route directions, three or more itineraries, and every route's detail data.
- [x] 1.2 Replace the three-bar live marker with a reusable two-arc wireless signal anchored to the upper-right of live time values; verify component tests show it for live predictions and omit it for scheduled predictions on home and route detail.

## 2. Home Sheet, Map Coordination, and Recents

- [x] 2.1 Remove the large `Nearby transit` heading and extend the sheet to minimized, compact, and expanded snap bounds with clamped drag behavior; verify interaction tests cover all three settled states and preserve a 44-pixel handle target.
- [x] 2.2 Report settled sheet state to the home screen so the map location control remains clear at minimized/compact bounds and is hidden at expanded; verify tests assert the control's visibility and that minimized content no longer obscures the usable map.
- [x] 2.3 Add route 51 and subway 7 cards and render selectable destination-oriented rows in Recents while leaving Favorites as a placeholder; verify tests cover all five route cards, recent destinations, and recent-trip selection.

## 3. Shared Route Details

- [x] 3.1 Generalize the Ronkonkoma-specific detail screen to render the selected shared route record, including route color, predictions, alerts, map labels, and timeline; verify component tests cover distinct content and colors for rail, bus, and subway records.
- [x] 3.2 Wire every nearby route card to the shared detail flow and preserve Back and Android hardware-back behavior; verify navigation tests open and return from Ronkonkoma, S1, E, 51, and 7 details.

## 4. Destination Route Results

- [x] 4.1 Make destination matches and recent search rows accessible buttons that pass the selected place into navigation; verify search tests open Route Results with the correct destination and return to search.
- [x] 4.2 Build the Route Results origin/destination editor, leave-time and refresh icon controls, and Fastest, Less transfers, and Cheapest selectors using local state; verify tests cover endpoint editing, each preference, leave-time feedback, refresh feedback, and state preservation.
- [x] 4.3 Render at least three recommended-first itinerary rectangles with colored route-segment boxes, fare, duration, and full-width next-ride timelines; verify tests assert ordering and all comparison fields without network calls.

## 5. Profile Placeholder and Integration

- [x] 5.1 Add the placeholder profile/settings screen and wire the home profile control, including account/settings rows, Sign out, and Back behavior; verify tests cover opening, placeholder action feedback, and returning home.
- [x] 5.2 Run `npm run lint`, `npm test`, `npm run typecheck`, and `npm run build`; verify the mobile workspace passes and Expo exports Android, iOS, and web bundles.
- [x] 5.3 Exercise minimized/compact/expanded sheet gestures, map control behavior, every route detail, recents, destination search through Route Results, result controls, profile, and Back navigation on Android; verify the completed prototype visually and leave the emulator open for review.

## 6. Firebase Architecture Transition

- [x] 6.1 Remove the obsolete standalone `server` workspace, Express health endpoint, server tests/build configuration, and any Express, CORS, MongoDB, or Mongoose dependencies; verify repository search and the dependency tree contain none of the removed backend packages or source paths.
- [x] 6.2 Retarget root start, platform, lint, test, type-check, and build scripts to the Expo mobile workspace and regenerate the root lockfile; verify every root command resolves without referencing `@pathly/api` or `server`.
- [x] 6.3 Remove the background mobile API-heartbeat integration and API URL environment examples while preserving visible Expo behavior; verify component tests render the same initial prototype without network calls or API configuration.
- [x] 6.4 Update the README and relevant project metadata to describe the Expo-only local workflow and the planned Firebase, Firestore, Cloud Functions, Authentication, and Storage architecture without claiming those services are implemented.
- [x] 6.5 Run clean-install/dependency inspection plus the full root validation suite after cleanup; verify no obsolete backend packages remain and all mobile lint, tests, type checking, and platform exports pass.
