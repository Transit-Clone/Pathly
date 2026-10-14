# Proposal

## Why

Testing Pathly means being somewhere: checking which stops and routes show up at Midtown, Jamaica, or the St. George terminal requires physically going there, and checking late-night behavior means waiting until late at night. The team needs an admin account that can stand in for a rider anywhere and at any time, and that can see what the app and backend are actually doing, without shipping those controls to ordinary riders.

## What Changes

- **An admin account.**
  - The account signed in as `admin@gmail.com` is the admin. The team creates it through the app's normal sign-up. Its password is never stored in the repository or the app.
  - The admin email is configuration, not a secret: an `ADMIN_EMAILS` list on the backend and `EXPO_PUBLIC_ADMIN_EMAILS` on the client, both defaulting to `admin@gmail.com`.
  - The backend checks it on every admin-only call. The client check only shows or hides the admin screens.
- **Mock location** (admin only):
  - The admin can set a pretend location in three ways: long-press on the home map, search for a place, or pick a preset (Stony Brook University, Penn Station, Times Square, Jamaica, St. George Terminal, Wall St/Pier 11, Hicksville, Ronkonkoma).
  - Everything that uses the rider's location then uses it instead: the home map's blue dot, Nearby, route-detail nearest stops, Route Results' "Current location" origin, and trip planning.
  - A banner on the home map shows "Mock location · Penn Station" with a control to turn it off.
  - It persists on the device until cleared.
- **Mock time** (admin only):
  - The admin can set the app's "now" to a chosen date and time, for example a weekday at 11:30 PM.
  - It applies to Leave now and the next-occurrence times in Route Results, the "leaves in" labels, and LIRR peak and off-peak fares.
  - Live predictions are real-time by nature, so while mock time is on, Nearby and route detail say they're showing live data for the real current time.
  - A banner shows the mock time.
- **Debug panel** (Profile → Admin tools):
  - **Backend status:** per agency, the published GTFS snapshot version and age, the last refresh result, and whether live feeds are configured and answering. This comes from a new admin-only `getBackendStatus` callable.
  - **Last requests:** the last 20 backend calls the app made, with the callable name, duration, outcome, and (for `planTrip`) the request and a summary of the response. Each can be copied as JSON.
  - **Caches:** clear the device cache (the saved nearby list and live times), clear the trip-plan session cache, and force a live-data refresh.
  - **Overlays:** show route IDs, stop IDs, and trip IDs on route detail and Trip Details, and show map tap coordinates.
  - **Rate limits:** see the admin's own remaining callable quota. Admins are rate-limited like everyone else, so testing reflects real behavior.
- **No admin data for riders:** non-admins never see these screens or banners, and admin-only callables reject them.

### Not in this change
- Admin powers over other users' data, or Firestore rules changes.
- Creating the admin account in code. The team signs up with the credentials it chose.
- Remote feature flags.

## Capabilities

### New Capabilities
- `admin-debug-tools`: identifying the admin account, mock location and time, the debug panel, and admin-only backend status.

### Modified Capabilities
<!-- None: mock location and time feed the existing features through their existing location and clock inputs, without changing their requirements. -->

## Impact

- **Backend (`firebase/functions`):**
  - `src/admin.ts` (`isAdmin(auth)`, comparing the token's email to `ADMIN_EMAILS` case-insensitively);
  - the `getBackendStatus` callable (admin-only), which reads the snapshot manifests and pings each live feed with a short timeout;
  - tests.
- **Mobile (`mobile/src`):**
  - `auth/` gains `useIsAdmin()`;
  - a new `debug/` module with the mock location and time context (`DebugContext`), a request log (wrapping the `httpsCallable` helper in `lib/firebase.ts`), the `AdminToolsView`, and the banners;
  - `useCurrentLocation` and `useNow` read from the debug context when overrides are set;
  - `tripPlanning.nextOccurrence` and the fare peak check take `now` from the same clock;
  - `ProfileView` gains the Admin tools row for admins.
- **Security note:** email/password sign-up doesn't verify email ownership, so whoever registers `admin@gmail.com` first becomes the admin. The team should create the account before anyone else could. The admin tools only change the admin's own app and read backend health, so the impact of misuse is limited.
- **Requires redeploying functions.**
