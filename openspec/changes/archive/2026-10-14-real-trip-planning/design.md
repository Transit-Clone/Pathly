# Design

## Context

- **Mock data today:**
  - `RouteResultsView` sorts the four hard-coded `itineraries` and shows them for any trip.
  - `scheduleItinerary` derives times from a fixed `MOCK_NOW_MINUTES` (10:00 AM).
  - `PlannedTripDetailView` invents per-leg times by splitting the duration evenly.
  - The results map and the trip-detail map are the illustrative `MapBackdrop`, with demo `mapPath`s.
- **Endpoints:**
  - `ResultsCriteria` keeps `origin` and `destination` as display strings, plus the destination's `SearchPlace` (with `id` = Google place ID and `location`, once Places details resolve).
  - The origin's place isn't kept. "Current location" relies on the device location, which `HomeScreen` already tracks (`location`, `locationStatus`).
- **Trip state:** `HomeScreen` tracks `selectedSearchTripId` and `activeTrip: { kind: 'planned'; itineraryId }`, both keyed by the mock `ItineraryId`.
- **Backend patterns to reuse:**
  - `geocodeAddress` already proxies a Google web service with the `GOOGLE_MAPS_API_KEY` secret, behind `enforceCallableSecurity` and rate limits.
  - `gtfsGeometry.ts` has a Douglas-Peucker `simplifyPath`.
  - Pulsing placeholders exist (`Skeleton.tsx`).
- **Routes API transit facts** (from Google's "Get a transit route" guide and the computeRoutes reference):
  - `POST https://routes.googleapis.com/directions/v2:computeRoutes` with `travelMode: "TRANSIT"`. A field mask is required (`X-Goog-FieldMask`).
  - `computeAlternativeRoutes: true` returns up to 3 additional routes. Transit doesn't support intermediate waypoints, traffic options, or route modifiers.
  - `departureTime` **or** `arrivalTime` (RFC 3339 UTC), from 7 days ago to 100 days ahead. If neither is set, the departure is now.
  - `transitPreferences.allowedTravelModes` (BUS, SUBWAY, TRAIN, LIGHT_RAIL, RAIL) is a **preference, not a filter**. `transitPreferences.routingPreference` is LESS_WALKING or FEWER_TRANSFERS.
  - Each transit step has `transitDetails`:
    - `stopDetails`: arrival and departure stop name, location, and time;
    - `localizedValues` for the times;
    - `headsign`;
    - `transitLine`: `agencies[]` (name, uri), `name`, `nameShort`, `color`, `textColor`, and `vehicle.type`/`name`/`iconUri`;
    - `stopCount`.
  - The route-level `travelAdvisory.transitFare` is present only when every step's fare is known.
- **Billing:** transit requests trigger none of the "Compute Routes Pro" features (traffic-aware routing, 11+ waypoints, waypoint optimization, location modifiers), so they bill as **Compute Routes Essentials**: 10,000 free requests per month, then $5 per 1,000. Rate limit: 3,000 queries per minute.

## Goals / Non-Goals

**Goals:**
- Real, schedule-accurate itineraries with several alternatives, shown in the existing results and trip-detail layouts.
- A small, typed, app-shaped response, so the client never parses Google's format.
- Stay inside the free tier for a class project, and fail gracefully.

**Non-Goals:**
- Turn-by-turn guidance and GTFS-RT predictions on trip legs.
- Saving trips to Recents.
- Service alerts.
- Places outside the service area.

## Decisions

### 1. A `planTrip` callable proxies the Routes API
- **Why server-side:** a callable keeps the key server-side (same secret as `geocodeAddress`) and lets us validate, rate-limit, and reshape. Calling Google from the client would ship the key and leave the parsing in three places (web, iOS, Android).
- **Options:** `protectedCallableOptions`, with a new `RATE_LIMITS.planTrip: { userPerMinute: 20 }`.
- **Request (client to callable):**
  ```ts
  type Endpoint = { placeId?: string; lat?: number; lng?: number; label: string };
  type PlanTripRequest = {
    origin: Endpoint; destination: Endpoint;
    time: { mode: 'now' } | { mode: 'depart' | 'arrive'; at: string /* RFC 3339 */ };
    preference: 'fastest' | 'transfers' | 'cheapest';
    modes: ('subway' | 'bus' | 'rail')[];
  };
  ```
- **Waypoints:** a place ID is preferred when present, because it routes to the place's proper entrance or station. Otherwise lat/lng is used. One of the two is required. With only a label, the client sends no request, and Route Results asks the rider to pick the place from search.
- **Validation:**
  - Coordinates, when sent, must be inside `SERVICE_AREA_BOUNDS`. That constant moves to a module shared by the function and the app, or is duplicated with a test asserting the two copies match.
  - `at` must fall within the API's window (now − 7 days to now + 100 days).
  - Unknown modes or preferences are rejected.
- **Google request:**
  - `travelMode: TRANSIT` and `computeAlternativeRoutes: true`.
  - `departureTime` or `arrivalTime` from `time`.
  - `transitPreferences.routingPreference: FEWER_TRANSFERS` only when `preference === 'transfers'`.
  - `allowedTravelModes`, only when some modes are excluded: subway → `SUBWAY` and `LIGHT_RAIL`, rail → `TRAIN`, bus → `BUS`.
  - `languageCode: en-US`, `units: IMPERIAL`.
  - A 15 s timeout.
- **Field mask** (only what we render, to keep responses small):
  ```
  routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,
  routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.startLocation,routes.legs.steps.endLocation,
  routes.legs.steps.transitDetails,routes.legs.startLocation,routes.legs.endLocation,
  routes.duration,routes.distanceMeters,routes.travelAdvisory.transitFare,routes.localizedValues.transitFare
  ```
- **Errors:**
  - Google 4xx/5xx, or a timeout → `HttpsError('unavailable')`.
  - Out-of-area or invalid input → `invalid-argument`, with `details.reason` (`'out-of-area' | 'bad-request'`).
  - An empty `routes` → `{ itineraries: [] }`, which is not an error.
- **Alternative considered:** the legacy Directions API (`transit_mode`, `alternatives=true`). Google calls it legacy and is steering new projects to the Routes API. Its response is the same in substance.

### 2. Normalization in `src/tripPlanning.ts`
The response type:
```ts
type TripStep =
  | { kind: 'walk'; durationSeconds: number; distanceMeters: number; toName: string; path: LatLng[] }
  | { kind: 'transit'; mode: 'subway' | 'bus' | 'rail' | 'other'; agency: { name: string; url?: string };
      line: { name: string; shortName?: string; color?: string; textColor?: string; vehicleName?: string };
      headsign?: string; from: Stop; to: Stop; stopCount: number; durationSeconds: number; path: LatLng[] };
type Stop = { name: string; location: LatLng; time: string /* RFC 3339 */ };
type Itinerary = {
  id: string; departureTime: string; arrivalTime: string; durationSeconds: number; transfers: number;
  fare?: { text: string; cents: number; currency: string }; steps: TripStep[];
};
```
- **Walking:** consecutive WALK steps merge into one walk. Its `toName` is the next transit leg's boarding stop, or "your destination".
- **Mode mapping** (`vehicle.type`):
  - SUBWAY, METRO_RAIL, LIGHT_RAIL, TRAM, MONORAIL → subway;
  - BUS, INTERCITY_BUS, TROLLEYBUS → bus;
  - RAIL, COMMUTER_TRAIN, HEAVY_RAIL, HIGH_SPEED_TRAIN, LONG_DISTANCE_TRAIN → rail;
  - anything else (FERRY, CABLE_CAR, and so on) → other. Other legs are never hidden by the Modes filter, since riders can't toggle them.
- **Times:**
  - Trip departure = the first transit departure minus the walking before it.
  - Trip arrival = the last transit arrival plus the walking after it.
  - A walking-only route uses now (or `at`) plus the walk. Google's route-level duration counts from the request time, so it would overstate a trip whose first train leaves later.
  - `transfers` = transit legs − 1.
- **Paths:** each step's encoded polyline is decoded on the server and simplified with the existing `simplifyPath` (4 m tolerance; export it from `gtfsGeometry.ts`). The client receives plain coordinates and needs no decoder.
- **Fare:** `travelAdvisory.transitFare` (`Money`) → cents, plus `localizedValues.transitFare.text`. When the fare is absent, `fare` is omitted.
- **Dedupe:** routes with the same sequence of (line, boarding stop, departure time) are merged. `id` is a short hash of that key, stable across refreshes for the same trip.
- **Ordering:** results come back in Google's order. The client orders them (decision 4).

### 3. Client data layer, `mobile/src/data/tripPlanning.ts`
- **`planTrip(criteria, location, now)`:**
  - builds the request: "Current location" → `location` (or a typed `'no-origin'` result when it's unknown); a place with an `id` and `location` → both; otherwise `'needs-place'`;
  - calls the callable;
  - maps errors to `'unavailable' | 'out-of-area' | 'empty'`.
- **Next occurrence:** `nextOccurrence(minutes, now)` turns the picker's minutes-after-midnight into an absolute time in **America/New_York** (via `Intl`, so a device in another time zone still plans NYC times). It's today if at least 1 minute ahead, otherwise tomorrow. The control shows "Tomorrow" when it rolls over.
- **Caching:** an in-memory cache for the session, keyed by the request (rounded to the minute for "now"), kept for 2 minutes. Going back and forth between results and a trip doesn't re-bill, while refresh bypasses the cache.
  - Results are never written to device storage or Firestore. Google's terms limit caching Routes content, and itineraries go stale quickly anyway.
- **Mock:** `jest.setup.js` gets a `planTrip` mock returning a two-itinerary fixture (LIRR, and LIRR plus subway), plus helpers to make it slow, empty, or failing.

### 4. Route Results
- **State:** a `useTripPlan(criteria, tripTime, location)` hook holds `{ status: 'loading' | 'loaded' | 'empty' | 'error' | 'no-origin' | 'out-of-area', itineraries, fetchedAt }`, and plans again when a criterion changes.
  - The preference only re-requests for `transfers`. Fastest and Lowest fare re-sort what's already loaded.
  - A refresh keeps the current cards and shows the existing small updating spinner.
- **Ordering:**
  - Fastest: by arrival time.
  - Fewer transfers: by transfers, then arrival.
  - Lowest fare: by fare cents, unknown fares last, then arrival.
  - No card is labeled as a best match: the order already says which comes first, and "best" claimed more than the sort knows.
- **Mode filter:** applied after the response. A card is hidden when any of its transit legs is in an excluded mode, and the existing "No routes match these modes" empty state is kept.
- **Card:**
  - Badges come from `line.shortName` (or LIRR branch codes, or an abbreviated name). `badgeLabel` keeps a single-word route code of up to 7 characters whole (`SIM3C`, `Q44-SBS`); only multi-word names are abbreviated, since `SIM3C` cut to `S` reads as the S shuttle. in `line.color`/`textColor`, with `RouteBadge` taking an explicit `mode` (not `transitModeForAgency`, which only knows the app's own agency strings).
  - The fare shows `fare.text` or "Fare N/A". Duration is in minutes.
  - The timing line reads "Leaves in N min · 10:12 AM → 11:20 AM" for "now", and "10:12 AM → 11:20 AM" otherwise.
- **Placeholders:** a new `ItinerarySkeleton` (three cards) in `Skeleton.tsx`, using `useSkeletonPulse`.
- **Results map:** the illustrative `MapBackdrop` is replaced with `TripMap` for the first visible itinerary, or with just origin and destination markers while loading.

### 5. Trip Details and `TripMap`
- **Model:**
  - `PlannedTripDetailView` takes the `Itinerary` snapshot plus the endpoint labels.
  - `SharedTripDetailView`'s `TripDetailModel` gains optional walk and transfer rows, and per-leg `agencyUrl`, `headsign`, and `stopCount`.
  - A `showServiceAlerts` prop is false for planned trips. (Recent trips, which showed the row, were removed with the sample data.)
- **Ending a trip:** END opens a `ConfirmDialog` ("End this trip?" with Cancel and End trip). It's an in-app `Modal`, because React Native's `Alert` shows no buttons on web.
- **Fare note:** under the leave and arrive times, "$X is the full adult one-way fare." Reduced fares, passes, OMNY fare capping, and onboard LIRR surcharges can differ.
- **Rows:**
  - A walk row reads "Walk 6 min · 0.3 mi to Stony Brook".
  - A transfer row reads "Transfer · walk 2 min · wait 9 min".
  - In leg cards, the agency text links out with `Linking.openURL`.
- **`TripMap.web.tsx` / `TripMap.native.tsx`:**
  - polylines per step: transit in the line color, 5 px; walking dotted, in a neutral color (a dashed icon sequence on web, `lineDashPattern` on native);
  - markers for the start, boarding and alighting points, and the destination;
  - fitted to the bounds of all points;
  - gestures disabled, matching the trip-detail requirement;
  - the same `googleMapStyle(isDark)` as the other maps.

### 6. Trip snapshots in `HomeScreen`
- `selectedSearchTripId` becomes `selectedTrip: Itinerary | null`.
- `activeTrip` becomes the started `Itinerary | null` (recent trips, the other kind, were removed).
- Opening a trip stores the object, so later refreshes can't change it (the same pattern the `route` view uses for route snapshots).
- `ResultsCriteria` gains `originPlace?: SearchPlace`. Choosing an origin from search keeps it, and swapping endpoints swaps both the places and the labels.

### 7. Fare estimates when Google has none (added during implementation)
- **Why:** recorded responses for Stony Brook trips returned an empty `transitFare` on all 12 routes, so Google has no fares for the LIRR or Suffolk. Without estimates, every card would say "Fare N/A" and "Lowest fare" would do nothing.
- **Where:** a new `src/tripFares.ts` holds an estimator passed to `normalizeRoutesResponse`. Google's fare always wins when present. Computed fares carry `estimated: true` (kept for diagnostics), but the client shows them like Google's: each is the exact published full adult one-way fare under the agencies' rules, so a "~" would undersell it. Trip Details notes that it's the adult one-way fare.
- **Flat fares**, from official sources, effective January 4, 2026:
  - NYC Transit subway and local bus: $3.00, with one free subway/bus transfer within 2 hours.
  - NICE: $3.00, with one free transfer within 2 hours (also to NYC Transit with OMNY).
  - Suffolk County Transit: $2.25, plus $0.25 for a transfer, covering up to 2 transfers within 2 hours (from Suffolk's own GTFS `fare_products.txt` and `fare_transfer_rules.txt`). A transfer from Suffolk to NICE also costs $0.25.
- **LIRR:**
  - Each station's zone, and the zone-to-zone one-way peak and off-peak fares, come from MTA's official LIRR fare chart (the PDF the former client `lirrFares.ts` cited).
  - A Google stop is matched to an LIRR station by the nearest LIRR GTFS stop within 400 m. Google's stop names differ from the GTFS names, so names aren't matched.
  - Peak uses the existing approximation, `isLirrPeakFare`, at the leg's departure.
  - Consecutive LIRR legs (a transfer at Jamaica or Ronkonkoma) are priced as one ride from the first boarding to the last alighting, since LIRR tickets are station-to-station.
- **Unknown:** any leg on an agency, or at an LIRR station, without a known fare leaves the whole fare unknown.

## Risks / Trade-offs

- [Google returns no transit trip for some suburban pairs, or late at night] → An explicit empty state that offers changing the time.
- [`allowedTravelModes` isn't a filter, so Google may still return excluded modes] → Filter on the client too, and show the reset-modes empty state.
- [Costs past the free tier] → Rate-limit 20 per minute per user, cache for 2 minutes, and send only one request per criteria change.
  - The README tells the deployer to set a **daily quota cap** on the Routes API in the Cloud console (for example 300 per day, about 9,000 per month), so a bug can't exceed the free 10,000.
- [The server key's restrictions block the Routes API] → A deployment step adds the Routes API to the key's API restrictions. The function logs `trip_planning_unavailable`, with Google's status, for diagnosis.
- [The trip's time zone differs from the device's] → All formatting uses America/New_York explicitly.
- [Google's terms for transit content] → Show agency names with links on each transit leg, show results only on Google maps, and don't persist results.
- [Fare estimates drift when agencies change fares] → Each table cites its source and effective date. Trip Details names the fare type, and a test pins the 2026 values so a fare change is a deliberate edit.
- [Response size] → The field mask plus server-side polyline simplification keep responses to roughly tens of KB for four itineraries.

## Migration Plan

1. Enable the **Routes API** in the Google Cloud project `pathly-b7f0f`. If the server key has API restrictions, add the Routes API to them. Optionally, set a daily quota cap.
2. Deploy functions (`planTrip`). The app works against the new function right away. Before the deploy, Route Results shows its "couldn't load trips" state.

**Rollback:** redeploy the previous functions. The previous app version doesn't call `planTrip`.
