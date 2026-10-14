# Tasks

## 1. Backend

- [x] 1.1 Add `src/admin.ts`: the `ADMIN_EMAILS` variable (defaulting to `admin@gmail.com`, never prompted for at deploy), `isAdmin(auth)` (a case-insensitive email match), and `requireAdmin(request)` (`permission-denied`). Verify with tests: the admin email in any case passes; other emails, a missing email, and an unauthenticated caller fail.
- [x] 1.2 Add the `getBackendStatus` callable: per-agency snapshot version, age, and last refresh, live feed configured/ok/ms (3 s timeout, in parallel, no secret values), and `myRateLimits`. Add `RATE_LIMITS.getBackendStatus = { userPerMinute: 6 }`. Verify with tests: a non-admin is rejected before any work; an admin gets one entry per agency; a hanging feed reports `ok: false` within the timeout. Run `npm test` and `npm run build`.

## 2. Client foundations

- [x] 2.1 Add `useIsAdmin()` with `EXPO_PUBLIC_ADMIN_EMAILS` (and add it to `.env.example`). Add `DebugProvider`: state persisted under `pathly.debug.v1`, ignored for non-admins, and cleared on sign-out. Verify with tests: a non-admin's context has no overrides even with stored state, and sign-out clears it.
- [x] 2.2 Route every `httpsCallable` use through a `callable(name)` wrapper in `lib/firebase.ts`, with the admin-only 20-entry request log and `planTrip` summaries. Verify that the existing App tests pass unchanged, and add a test that an admin's `planTrip` appears in the log with its duration and outcome while a non-admin's doesn't.

## 3. Mock location and time

- [x] 3.1 Make `useCurrentLocation` return the mock location when set. Add the home banner ("Mock location · <label>", with Turn off), long-press on the map to set it, the presets, and search-to-set. Suppress the location-unavailable chip while mocking. Verify with App tests: with the mock set to Penn Station, the map centers there, `findNearbyTransit` is called with Penn's coordinates, Route Results plans from Penn, and turning it off returns to the real location.
- [x] 3.2 Add `useClock()`. `useNow`, `useTripPlan`, and `nextOccurrence` use it. Leave now becomes an explicit depart at the mock time. Add the mock-time banner and the "Live times are real-time" note. Verify with App tests: mock time 2:30 AM makes Leave now send `depart` at 2:30 AM on the mock date, and Depart at 7:00 AM sends the same day's 7:00 AM.

## 4. Admin tools screen

- [x] 4.1 Add `AdminToolsView` (Profile → Admin tools, admins only): Backend status, Recent requests (with copy as JSON), Caches (clear the device cache, clear the trip-plan cache, refresh live now), Overlays (IDs, tap coordinates), mock location and time controls, and Rate limits. Verify with App tests: a non-admin has no row; an admin sees each section; Clear device cache empties AsyncStorage's Pathly keys; the IDs overlay shows the route and stop IDs on route detail.

## 5. Integration check

- [ ] 5.1 Run all test suites, typecheck, and lint. The team signs up as admin@gmail.com. On web at phone width, in light and dark: set the mock location to each preset and check Nearby; plan trips from the mock location at a mock 2:30 AM; read Backend status; copy a planTrip log entry. Sign in as a non-admin and confirm nothing admin-related shows, and that calling `getBackendStatus` from the console is rejected.
