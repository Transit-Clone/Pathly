# Tasks

## 1. Navigation Domain and Location Evidence

- [x] 1.1 Add the active-session, selection-identity, checkpoint, cursor, phase, and guidance types plus itinerary normalization in `mobile/src/data/enrouteNavigation.ts`; verify focused Jest cases cover walking, boarding, known intermediate stops, sparse-stop legs, transfers, trailing walks, arrival, and two retimed departures sharing one itinerary ID.
- [x] 1.2 Implement pure distance/projection and monotonic `advanceNavigation` evidence rules with centralized thresholds; verify focused Jest cases cover two-fix real movement, one-fix admin movement, forward checkpoint skips, jitter/backtracking, overlapping transfer coordinates, stale/poor fixes, off-route holds, and idempotent arrival.
- [x] 1.3 Extend `useCurrentLocation` to expose timestamped/accuracy-aware real and mock fixes and refresh on foreground return while keeping the service-area fallback out of navigation; verify hook tests cover permission denial, mock precedence, accuracy propagation, subscription cleanup, and foreground refresh.

## 2. Resume Storage and Active-Trip Lifecycle

- [x] 2.1 Add a versioned, UID-scoped navigation storage adapter containing one resume reference and at most 20 provider-light Recent summaries, with serialized writes and runtime validation; verify storage tests cover corrupt/unsupported data, UID isolation, 24-hour active expiry, 30-day temporary-coordinate expiry, history ordering/cap, and absence of a serialized raw `Itinerary` or geometry.
- [x] 2.2 Add an internal absolute-departure resume planning option and exact selection-fingerprint matching; verify planner tests restore the chosen retimed departure and return recovery for a failed request, missing candidate, or merely similar itinerary instead of substituting it.
- [x] 2.3 Implement `useActiveTrip` hydration and recovery states for the authenticated UID, including Retry and safe handling of invalid records; verify hook tests cover the initial hydration gate, same-account restore, other-account isolation, exact cursor restore, and retained recovery state.
- [x] 2.4 Implement coordinator actions for start, confirm/cancel replacement, monotonic progress persistence, admin reset, arrived completion, and confirmed early end; verify lifecycle tests prove each completion writes one Recent and clears active state atomically, duplicate events remain idempotent, and cancellation changes nothing.
- [x] 2.5 Replace Admin Tools' prefix-wide device-cache deletion with an allowlist of disposable cache keys that preserves navigation/history state; verify an admin test clears nearby/live caches without removing an active-session storage key.

## 3. Active Map Behavior

- [x] 3.1 Extend `tripMap.ts` to derive completed, current, and upcoming render segments plus the immediate follow target from normalized progress; verify unit tests cover walking/transit colors, transfer boundaries, sparse geometry, stop visibility, and cursor changes.
- [x] 3.2 Update native `TripMap` to draw Pathly's explicit real/mock marker, disable the conflicting OS dot, retain a stale marker, and support follow/pan/recenter behavior; verify native component tests assert marker source, stale treatment, follow-camera updates, pan pause, and locate resume.
- [x] 3.3 Add equivalent explicit-marker, progress styling, and follow behavior to web `TripMap`; verify web component tests assert parity with native for mock movement, completed/current/upcoming styling, pan pause, and locate resume.

## 4. Enroute Experience and Home Integration

- [x] 4.1 Build `EnrouteNavigationView` from the redesigned map-first primitives with current action, next action/stop, line/headsign, known remaining stops, arrival, location status, Back, locate, and confirmed END; verify component tests cover walking, waiting, riding, transferring, sparse data, arrived/recovery states, and screen-reader labels.
- [x] 4.2 Replace `HomeScreen`'s transient `activeTrip` state with the coordinator and route `GO` to a dedicated enroute view using the exact retimed itinerary and request criteria; verify app tests cover an alternate departure, absence of departure controls after GO, refresh-independent active state, and end/replace confirmation behavior.
- [x] 4.3 Add the Home Resume trip card without hiding or disabling Nearby, Recents, Favorites, search, profile, or admin tools; verify integration tests show Back preserves the session, Resume reopens it, and every existing home navigation path remains operable.
- [x] 4.4 Connect accepted location fixes to guidance/map progress and complete on arrival; verify an integration test drives a multi-leg fixture through walk, board, intermediate stops, transfer, final walk, and arrival with visible instructions and no backward progress.
- [x] 4.5 Render real provider-light cards in `TransitSheet` Recents and open fresh Route Results from a selected summary; verify tests cover the empty state, newest-first order, arrived and ended-early labels, 20-item cap, per-account isolation, and a fresh planning request instead of replayed route content.
- [x] 4.6 Wire relaunch rehydration into the app lifecycle; verify integration tests show an exact active trip/cursor resumes after remount and a non-matching or offline rehydrate displays Retry and End without silently changing route.

## 5. Admin Demo Controls

- [x] 5.1 Generate admin demonstration checkpoints from the normalized active itinerary and add admin-only Previous, Next, selection, and Reset controls to active navigation; verify tests show checkpoint actions update `DebugContext.setMockLocation`, backward movement does not regress progress, Reset rewinds the demo, and non-admins cannot see or invoke the controls.
- [x] 5.2 Add a full admin demo integration test that advances the shared mock location from origin through boarding, known stops, transfers, and destination and verifies the production progress pipeline creates exactly one Recent.
- [x] 5.3 Document the repeatable native/web demo flow and recovery/reset steps in `docs/enroute-demo.md`; verify a developer can follow the document from sign-in through arrival without editing state or code.

## 6. Integration Verification

- [x] 6.1 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`; verify all mobile/backend tests, TypeScript, lint, and Expo exports pass with no new warnings attributable to this change.
- [ ] 6.2 Execute the documented admin-checkpoint demo on one native target and web, including background/foreground return, Back/Resume, map pan/recenter, END cancel, arrival, Recents, and relaunch recovery; record any platform variance and verify no existing product surface was disabled.
