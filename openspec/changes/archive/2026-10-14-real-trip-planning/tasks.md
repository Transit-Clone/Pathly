# Tasks

## 1. Backend: `planTrip`

- [x] 1.1 Enable the Routes API for the project. Then record one real `computeRoutes` transit response with the design's field mask and `computeAlternativeRoutes: true`: Stony Brook University → Penn Station, departing on a weekday morning. Save it as `firebase/functions/test/fixtures/routes-sbu-penn.json`, with the key and any personal data stripped. Record a second response that includes a walking-only or bus leg, for example Stony Brook University → Smith Haven Mall, as `routes-sbu-mall.json`. Verify each file parses and contains at least two routes with `transitDetails`. (The user enables the API; the recording is a one-off script in the scratchpad, not committed.)
- [x] 1.2 Add `src/tripPlanning.ts` with the following, and export `simplifyPath` from `gtfsGeometry.ts` for it:
  - `buildRoutesRequest(request)`: waypoints, time, preferences, and modes mapping;
  - `normalizeRoutesResponse(json, requestTime)`: walk merging, mode mapping, times, transfers, fare, decoded and simplified paths, dedupe, and stable ids;
  - an encoded-polyline decoder.

  Verify with `test/tripPlanning.test.js`:
  - the two fixtures normalize to itineraries whose stop names, times, and line colors match the raw JSON;
  - consecutive walks merge;
  - a route without `transitFare` has no `fare`;
  - duplicate routes collapse;
  - ids are identical across two normalizations;
  - `allowedTravelModes` is omitted when all modes are enabled and correct when LIRR is excluded;
  - FEWER_TRANSFERS is set only for the `transfers` preference;
  - the decoder round-trips Google's documented example polyline.
- [x] 1.3 Add the `planTrip` callable in `src/index.ts`:
  - `protectedCallableOptions`, `RATE_LIMITS.planTrip = { userPerMinute: 20 }`, and the `googleMapsApiKey` secret;
  - input validation: endpoint shape, service-area bounds, the time window, and known enums;
  - a 15 s timeout;
  - error mapping: `unavailable`, and `invalid-argument` with `details.reason`;
  - an empty `routes` → `{ itineraries: [] }`;
  - a `trip_planning_unavailable` log with Google's status.

  Verify with tests (stubbing `fetch` with the fixtures): it requires auth and consumes a rate-limit token; out-of-area coordinates are rejected with `out-of-area` before any fetch; a 403 from Google maps to `unavailable`; an empty response gives an empty list. Run `npm test` and `npm run build` in `firebase/functions`.

## 1b. Fare estimates

- [x] 1b.1 Add `src/tripFares.ts` with the estimator from design decision 7:
  - flat NYC Transit, NICE, and Suffolk fares and transfer rules;
  - the LIRR zone table (each station's zone, and zone-to-zone peak and off-peak one-way fares) taken from MTA's official fare chart, citing its source and effective date;
  - nearest-LIRR-stop matching (within 400 m) against the LIRR GTFS stops;
  - consecutive LIRR legs priced as one ride;
  - peak by `isLirrPeakFare` at the leg's departure;
  - an unknown agency or station leaving the fare unknown.

  Wire the estimator into `planTrip`. Verify with `test/tripFares.test.js`: Stony Brook → Penn off-peak and peak equal the chart's Zone 10 → Zone 1 fares; Suffolk 51 → LIRR Ronkonkoma → Penn equals $2.25 plus the chart's fare; two Suffolk buses equal $2.50; subway plus local bus equals $3.00; an unknown agency gives no fare; and the recorded fixtures all get estimates.

## 2. Client data and state

- [x] 2.1 Add `mobile/src/data/tripPlanning.ts`:
  - the shared types;
  - `nextOccurrence(minutes, now)` in America/New_York, returning `{ at, tomorrow }`;
  - building endpoints from the criteria and location, where "Current location" without a location gives `no-origin`, and a place without a usable location or Google place id (a `[0, 0]` saved location, or a demo id) gives `needs-place`;
  - the `planTrip` call with error mapping;
  - the 2-minute session cache, with refresh bypassing it;
  - the ordering functions for fastest, fewer transfers, and lowest fare;
  - the mode filter.

  Add the `planTrip` mock and fixtures to `jest.setup.js`. Verify with `__tests__/tripPlanning.test.ts`:
  - `nextOccurrence` across midnight and across the DST change (device-zone independence holds by construction: only UTC methods and `Intl` with an explicit zone, since Node can't switch TZ inside a test);
  - each ordering, including unknown fares last;
  - the mode filter hides a card with an excluded leg and keeps "other" legs;
  - the cache serves a repeat request without a second call while refresh calls again.
- [x] 2.2 In `HomeScreen`:
  - add `originPlace` to `ResultsCriteria`, set it from the origin search, and swap it with the destination;
  - replace `selectedSearchTripId` and the planned `activeTrip` id with `Itinerary` snapshots.

  Remove the mock `itineraries`, `itineraryById`, `scheduleItinerary`, `MOCK_NOW_MINUTES`, `ItineraryId`, and `realFareForItinerary`, keeping the recent-trip helpers. Verify with `npm run typecheck`, and an App test that starts a trip, refreshes the results with a different mock response, and finds the active trip unchanged.

## 3. Route Results

- [x] 3.1 Add the `useTripPlan` hook and wire `RouteResultsView` to it:
  - real cards (badges from line short names and colors via an explicit `mode` prop on `RouteBadge`, the fare text or "Fare N/A", the duration, and the timing line);
  - ordering by preference, with Fewer transfers re-requesting;
  - Modes re-requesting and filtering;
  - the leave-time picker producing next-occurrence times, with "Tomorrow" shown when the time rolls over;
  - refresh re-requesting, with an "Updated N min ago" label;
  - the states: placeholder cards (`ItinerarySkeleton` in `Skeleton.tsx`), "No transit trips found" with a change-time action, "Couldn't load trips" with retry, choose a starting point (`no-origin` and `needs-place`), and outside the service area.

  Update the App tests that used mock itinerary ids to the mocked `planTrip`. Verify with App tests for each state, for the order under each preference, for Rail exclusion hiding the LIRR card and re-requesting with the mode preference, and for Depart at 7:00 AM after 11:00 PM showing "Tomorrow" and sending tomorrow's time.
- [x] 3.2 Add `TripMap.web.tsx` and `TripMap.native.tsx`:
  - colored transit polylines and dotted walking lines;
  - start, transfer, and end markers;
  - fitted bounds, no gestures, and the shared map style.

  Use the map behind Route Results (the first visible itinerary, or the endpoints while loading). Verify with an App test that the native mock map receives one polyline per step with the line colors and a dashed walk, and check on web that the results map shows the first trip.
  - Automated checks pass. The web check needs the deployed `planTrip` and is done in 5.1.

## 4. Trip Details

- [x] 4.1 Rebuild `PlannedTripDetailView` on the `Itinerary` snapshot:
  - walk rows, transit leg cards (agency link, line, headsign, boarding and alighting stops and times, stop count, duration), and transfer rows with the walk and the wait;
  - real leave and arrive times, the fare (or "Fare N/A"), and the total duration;
  - `TripMap` in place of the illustrative map;
  - the service-alert row hidden for planned trips through a new `SharedTripDetailView` prop, with recent trips unchanged.

  Verify with App tests: a two-leg fixture shows walk → LIRR → transfer (with the computed wait) → subway → walk in order, with the fixture's times; the agency name opens its URL; no "Service alerts" row appears; the recent trip detail tests still pass.
- [x] 4.2 Document in `README.md`: enabling the Routes API, adding it to the server key's API restrictions, the Essentials free tier (10,000 per month), and setting a daily quota cap. Verify that the steps match the Cloud console's current labels and that the documented quota setting exists.

## 4b. Review follow-ups (added during implementation)

- [x] 4b.1 Remove the "BEST MATCH" label from the first Route Results card.
- [x] 4b.2 Show fares without "~" (`fareLabel`), and add "$X is the full adult one-way fare." under the leave and arrive times in Trip Details.
- [x] 4b.3 Label the Rail mode chip "LIRR" (the mode id stays `rail`).
- [x] 4b.4 In `badgeLabel`, keep single-word route codes of up to 7 characters whole (`SIM3C`, `Q44-SBS`). Verified with `components.test.tsx`.
- [x] 4b.5 Add `ConfirmDialog` and have END on Trip Details ask "End this trip?" first. Verified with an App test: Cancel keeps the trip, End trip ends it.
- [x] 4b.6 Remove the sample `recentTrips`, `RecentTripDetailView`, `TripCard`, and `lirrFares.ts`, and the recent-trip state in `HomeScreen`. Recents shows "No recent trips yet". App tests that reached trip details through recent trips now open planned trips.
- [x] 4b.7 Reduce the gap between the home sheet's handle and its tabs (handle 28 → 24 px, tabs top padding 12 → 2 px, `TRANSIT_TABS_HEIGHT` 44 → 30).

  Verified: `npm run typecheck`, lint on the changed files, and `npm test` in `mobile/` (175/175). On web, the Recents empty state and the tighter tab gap were checked at phone width.

## 5. Integration check

- [ ] 5.1 Run `npm test` and `npm run build` in `firebase/functions`, and `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`. The user enables the Routes API and deploys functions. On web, in light and dark themes, plan Stony Brook University → Penn Station with Leave now, Depart at a later time, Arrive by, each Filter option, and LIRR excluded. Then open a trip and check the steps, times, fare, map, and agency links against Google Maps' own transit directions for the same trip. Plan a late-night trip to see the empty state, and turn Firebase off (or block the request) to see the error state.
