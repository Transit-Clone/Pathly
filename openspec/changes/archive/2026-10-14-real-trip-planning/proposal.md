# Proposal

## Why

Route Results and the planned Trip Details page are still mock-ups. Whatever origin and destination the rider picks, the screens show the same four hard-coded itineraries (`itineraries` in `mobile/src/data/transit.ts`). Times come from a fixed 10:00 AM "now", and each leg's duration is guessed by dividing the trip evenly. The rider can already search for real places with Google Places, so the screens look ready, but none of the trips they show are real.

## What Changes

- **Real itineraries from the Google Routes API.**
  - A new Cloud Function, `planTrip`, calls Routes API `computeRoutes` with `travelMode: TRANSIT` and `computeAlternativeRoutes`. This usually returns up to four different ways to get there, across subway, bus, LIRR, and walking.
  - The function turns Google's response into a compact, app-specific trip format and returns that, not the raw Google response.
  - The Maps API key stays on the server, as the existing `geocodeAddress` proxy already does.
- **Route Results shows real trips.**
  - Results are fetched for the chosen origin and destination. "Current location" uses the rider's location.
  - **Leave time:** "Leave now", "Depart at", and "Arrive by" become real departure or arrival times, using the next occurrence of the chosen time.
  - **Modes:** sent to Google as preferred travel modes, and also enforced in the app, because Google treats them only as preferences.
  - **Filter:** "Fewer transfers" asks Google for fewer transfers. "Fastest" orders by arrival time. "Lowest fare" orders by Google's fare estimate.
  - **Refresh:** fetches again, and the "Updated" label shows when the results were actually fetched.
  - **Loading, error, and empty states:** loading shows pulsing placeholder cards like Nearby. Errors and empty results get their own states ("No transit trips found", "Couldn't load trips").
  - The map shows the origin, the destination, and the top result's path on a real Google map.
- **Trip Details reflects the real trip.**
  - Each step appears in order: walking (duration and distance), boarding a line (agency, line, headsign, departure stop and time), the number of stops, getting off (stop and time), and the wait at each transfer.
  - The total fare and duration, and the leave and arrive times, are real.
  - The map draws each transit leg in its line's color and walking as a dotted line.
  - The made-up "Service alerts · No delays" row is removed from planned trips, since there's no real alert data behind it.
  - Each leg shows the operating agency, linked to the agency's website, as Google requires for transit results.
- **Trips are snapshots.**
  - Opening or starting a trip keeps the trip it was opened from, so a refresh or a changed criterion doesn't change a trip that's open or in progress. This matches how route pages already keep the route they were opened from.
- **Review follow-ups (added during implementation):**
  - Route Results no longer labels the first card "BEST MATCH".
  - The Rail mode is labeled **LIRR**, the only commuter rail Pathly covers ("Train" reads as the subway in NYC).
  - Route badges show single-word route codes whole (`SIM3C`, `BxM10`, `Q44-SBS`) instead of cutting them to an initial.
  - Fares show without "~": a computed fare is the published full adult one-way fare, and Trip Details says so.
  - Ending a trip asks for confirmation first.
  - The Recents tab shows "No recent trips yet" in place of its sample trips, until real trips are saved (a later change).
  - The gap between the home sheet's handle and its tabs is smaller.
- **BREAKING (internal):** the mock `itineraries`, `itineraryById`, `scheduleItinerary`, `MOCK_NOW_MINUTES`, and `ItineraryId` types are removed, and so are the Recents tab's sample `recentTrips`, `RecentTripDetailView`, `TripCard`, and `lirrFares.ts`.

### Not in this change
- Turn-by-turn guidance during a trip, and live (GTFS-RT) predictions on trip legs.
- Saving real trips to Recents (until then, Recents is empty).
- Trips outside the existing NYC/Nassau/Suffolk service area.
- Real service alerts.

## Capabilities

### New Capabilities
<!-- None: trip planning extends the existing navigation and UI capabilities. -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Modified:** "Search selection opens route results" (real itineraries, not mock).
  - **Modified:** "Route Results supports editable trip criteria" (criteria drive real requests; refresh refetches).
  - **Modified:** "Route Results presents comparable itineraries" (real results; loading, empty, and error states).
  - **Modified:** "Expanded prototype remains local" (trip results become a second backend-backed exception, with a graceful unavailable state).
  - **Removed:** "Planned and recent trip details share interactions" (the recent half showed only sample trips).
  - **Added:** "Planned trip details provide trip interactions" (a planned trip is a snapshot of a real itinerary; ending a trip asks for confirmation).
  - **Modified:** "Home transit content includes recents and additional routes" (Recents shows an empty state instead of sample trips).
  - **Modified:** "Session favorites appear in the Favorites tab" (only planned trips can be favorited).
  - **Added:** "Real transit trip planning".
- `mobile-ui-design`:
  - **Modified:** "Consistent trip-detail presentation" (walking steps, transfer waits, agency attribution, and a fare note; no placeholder alert row on planned trips).
  - **Modified:** "Mode-aware route badge" (single-word route codes show whole).
  - **Removed:** "Recent trip card presentation" (the sample recent trips are gone).
  - **Added:** "Trip map shows the real path".

## Impact

- **Backend (`firebase/functions`):**
  - New `planTrip` callable in `src/index.ts` (authenticated, rate-limited, uses the `GOOGLE_MAPS_API_KEY` secret).
  - New `src/tripPlanning.ts` for the request building, Routes API call, and response normalization. Its polyline simplification reuses the existing `simplifyPath`.
  - New tests with a recorded Routes API response.
- **Google Cloud:**
  - Enable the **Routes API** on the project, and allow it on the server key if the key has API restrictions.
  - Transit requests bill as **Compute Routes Essentials**, which includes 10,000 free requests per month. None of the request's features trigger the Pro tier.
- **Mobile (`mobile/src`):**
  - New `data/tripPlanning.ts` (client and types).
  - `RouteResultsView`, `PlannedTripDetailView`, and `SharedTripDetailView` are updated, and the `HomeScreen` state holds trip snapshots.
  - New `TripMap` (`.web` / `.native`) draws a trip's legs.
  - The mock itinerary data and the sample recent trips are removed, with `RecentTripDetailView`, `TripCard`, and `lirrFares.ts` (which only priced them).
  - New `ConfirmDialog` for confirming the end of a trip.
- **Tests:** the App tests that rely on mock itineraries are rewritten against a mocked `planTrip` callable.
- **Requires redeploying functions.**
