# Design

## Context

- **Auth:**
  - Firebase Auth with email and password (`mobile/src/auth/authService.ts`, `AuthContext.tsx`).
  - Callables go through `enforceCallableSecurity` in `firebase/functions/src/callableSecurity.ts`, which reads `request.auth.uid` and applies per-user rate limits from `RATE_LIMITS`.
  - There's no role concept yet.
- **Location:** `useCurrentLocation()` returns `{ location, status, refresh }`. `HomeScreen` passes `location` to the map, Nearby (`findNearbyTransit`), route detail, and Route Results (`riderLocation(...)`).
- **Clock:**
  - `useNow()` drives relative labels.
  - `tripPlanning.nextOccurrence(minutes, now)` already takes `now`. The `useTripPlan` callers pass `Date.now()`.
  - Fares are computed on the server from the itinerary's own times, so they follow the requested time automatically.
- **Caches:** `deviceCache.ts` (AsyncStorage) and the trip-plan session cache in `tripPlanning.ts`.
- **Status data:** snapshot manifests in Cloud Storage (`gtfsSnapshots.ts`) and the live feed configs in `gtfsAgencies.ts`.

## Goals / Non-Goals

**Goals:**
- Test any place and time from a desk, through the same code paths riders use.
- Make backend health and request behavior visible.
- Nothing visible or callable for non-admins.

**Non-Goals:**
- Managing other users.
- Server-side impersonation.
- Feature flags.
- Hiding the admin email (it isn't a secret).

## Decisions

### 1. Admin by email, checked on both sides
- **Backend:** `isAdmin(auth)` returns true when `auth?.token.email` lowercased is in `ADMIN_EMAILS`. That's a comma-separated `defineString` parameter, defaulting to `admin@gmail.com`. Admin callables call `requireAdmin(request)` after `enforceCallableSecurity`, which throws `permission-denied`.
- **Client:** `useIsAdmin()` compares `user.email` against `EXPO_PUBLIC_ADMIN_EMAILS` (defaulting to the same). It only gates UI, so a tampered client gains nothing but its own local overrides.
- **Alternative considered:** custom claims set by an Admin SDK script. It's more secure, because it doesn't depend on who registers the email first, but the team chose the simpler email check. Switching later only means changing `isAdmin`.

### 2. Overrides live in one `DebugContext`
- `DebugProvider` (inside `AuthProvider`) holds `{ mockLocation?: { label, latitude, longitude }, mockTime?: { at: number, setAtRealMs: number }, overlays: { ids, tapCoords } }`. It's persisted in AsyncStorage under `pathly.debug.v1` and **ignored entirely unless `useIsAdmin()`**, so a signed-out or non-admin session on the same device can't inherit it.
- **Location:** `useCurrentLocation` returns `{ location: mock, status: 'located' }` when `mockLocation` is set, and skips the GPS fix. Every consumer goes through this hook, so no other component changes. The existing "Location unavailable — showing Stony Brook" chip is suppressed while mocking.
- **Time:** a `useClock()` hook returns `mockTime ? mockTime.at + (Date.now() - mockTime.setAtRealMs) : Date.now()`, so mock time keeps ticking.
  - `useNow` and the `useTripPlan` callers use it.
  - `time.mode 'now'` in `planTrip` becomes an explicit `depart` at the mock time, because the server's "now" is real.
  - The live-data screens show a small "Live times are real-time" note when mock time is set.
- **Setting a mock location:**
  - A long-press on the home map (`onLongPress` on native, a `contextmenu` or long-press handler on web) opens a small sheet: "Use as mock location".
  - The Admin tools screen offers the presets and a "Search a place" button that reuses `SearchView` in a picker mode, returning the resolved place.

### 3. Request log by wrapping the callable helper
- `lib/firebase.ts` exports one `callable(name)` wrapper, which all `httpsCallable` uses are routed through. That's a mechanical refactor of the existing call sites.
- For admins, it records `{ name, startedAt, ms, ok, code?, request, responseSummary }` into an in-memory ring buffer of 20 entries.
- Summaries are small: for `planTrip`, the itinerary count and each itinerary's lines, times, and fare. Raw responses aren't kept, so memory stays small and Google's content isn't stored.
- Nothing is persisted, and nothing is recorded for non-admins.

### 4. `getBackendStatus` callable
- Admin-only, under `protectedCallableOptions`. It returns, per agency:
  - `{ snapshotVersion, publishedAt, ageHours, lastRefresh: { at, ok, message? } }` from the manifests;
  - `live: { configured: boolean, ok?: boolean, ms?: number }`. A configured feed is checked with a HEAD or minimal GET, with a 3 s timeout and in parallel. `configured` means its secret is present. Secret values are never returned.
- `RATE_LIMITS.getBackendStatus = { userPerMinute: 6 }`.

### 5. Rate-limit view
- `callableSecurity.ts` gains an admin-only read of the caller's own current token-bucket state, returned by `getBackendStatus` under `myRateLimits`. Admins have no bypass.

### 6. Overlays
- With `overlays.ids` on, `RouteDetailView` shows `route.id` under the title and each stop row's `stopId`. Trip Details shows each leg's matched trip ID when the backend provides one (`trip-stops-and-interactive-map`), otherwise nothing.
- With `overlays.tapCoords` on, a map tap shows a toast with "40.75052, -73.99345" that can be copied.

## Risks / Trade-offs

- [Someone else registers admin@gmail.com first] → The team should create the account now. The impact is limited: the admin tools change only the admin's own app and read backend health. They expose no user data and no secret values. The custom-claim upgrade path is noted.
- [Mock state leaking into a rider session on a shared device] → Overrides are ignored unless the signed-in user is an admin, and they're cleared on sign-out.
- [Mock time confusing live data] → Live predictions stay real and labeled. Only planning and labels follow mock time.
- [The callable wrapper refactor touches every call site] → It's mechanical, and the existing App tests mock `httpsCallable` underneath the wrapper, so they keep working.

## Migration Plan

1. Deploy the functions (the `ADMIN_EMAILS` param uses its default).
2. The team signs up as admin@gmail.com in the app.
3. Ship the client.
4. Rollback: the client hides the admin entry if `getBackendStatus` is missing.

## Open Questions

- Should the presets also include a few far-suburb points (Montauk, Port Jefferson) for density testing? That's easy to extend later.
