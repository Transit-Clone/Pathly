# Design

## Context

- `SearchView.tsx` renders the illustrated `MapBackdrop`, absolutely positioned numbered pins (from the mock `pin: {x, y}` fields in `mockSearch.ts`), and an absolutely positioned rounded results sheet whose height is computed from window and keyboard height. Matching is synchronous (`findMockDestinations`).
- `MapBackdrop` is still used by Route Results, route detail, and trip detail. The home screen's `GoogleMapView` is untouched by this change.
- Keys come from `.env`. `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` is bundled into the client. The native keys are build-time only (`app.config.js`).
- The app runs on web for day-to-day work and on Android/iOS through dev builds.

## Goals / Non-Goals

**Goals:**
- Land phase 1 (a plain, full-screen search page) as a self-contained step before any Places work.
- Match the standard Google Maps search look: search bar on top, flat list below, pin and clock icons, bold name with muted address.
- Use one Places client that works the same on web, Android, and iOS.
- Keep search fully mockable in Jest (no network).

**Non-Goals:**
- No changes to the home screen, its map, or its current-location control.
- No real routing or itineraries for the chosen place. Route Results stays mock.
- No persisted recents or Firestore writes.
- No server-side proxy for the API key (prototype stage).

## Decisions

1. **Flat full-screen layout instead of a sheet.** `SearchView` becomes a column: the `SafeAreaView` header with the search row, then a `flex: 1` `ScrollView`/list with `keyboardShouldPersistTaps="handled"`. The screen background is `colors.surface`. The absolute sheet, `sheetHeight`, the keyboard-height listener, rounded corners, and shadow are removed. `KeyboardAvoidingView` remains so the list's bottom stays above the keyboard. *Alternative:* keep the sheet over a blank canvas. Rejected because the user asked for a standard Google Maps–style page.
2. **Remove the map and pins.** `MapBackdrop` and the pin overlay go, along with their styles. The `pin` field is removed from `MockSearchPlace` (now used only for sample recents).
3. **Google Maps–style rows.** Each row has a 40 px round icon well (`place` pin icon for suggestions, `recent` clock for recents), a bold title, a muted subtitle, and a hairline divider. The numbered badges and chevron are dropped. The "Recent" label stays for the empty-query state. The "Matches" heading and the count are removed.
4. **Places API (New) over REST with `fetch` on all platforms.**
   - Autocomplete: `POST https://places.googleapis.com/v1/places:autocomplete` with `input`, `sessionToken`, `locationRestriction.rectangle` set to `SERVICE_AREA_BOUNDS`, and `includedRegionCodes: ["us"]`. `origin` is not sent: in Places API (New) it only computes `distanceMeters` and does not affect ranking, and autocomplete accepts a single bias region, so the service-area rectangle is used instead of a circle around the rider. A restriction rather than a bias is used because a bias still lets exact text matches in other states rank first, and Pathly can't route to them. Scaling to more regions means widening `SERVICE_AREA_BOUNDS` or, for separate regions, restricting to the rider's current region.
   - Details: `GET https://places.googleapis.com/v1/places/{id}?sessionToken=…` with `X-Goog-FieldMask: id,displayName,formattedAddress,location`.
   - The key is sent in the `X-Goog-Api-Key` header, never in the URL.
   - *Alternatives:* (a) the Maps JS `AutocompleteSuggestion` class on web plus a native SDK on mobile: two code paths, and native SDKs need extra config plugins. (b) the legacy Places Autocomplete: deprecated for new projects. REST keeps one testable module.
5. **Session tokens.** A UUID session token is generated when the search screen opens. It is reused for every autocomplete call and the one details call, then rotated after a selection, which keeps billing to one session per search.
6. **Debounce and stale-response guard.** A `usePlacesSearch(query)` hook waits about 300 ms after typing stops, aborts the in-flight request with `AbortController`, and keeps a response only if it matches the current query and retry attempt, so late responses are dropped. It returns `{ status: 'idle' | 'loading' | 'success' | 'error' | 'unconfigured', suggestions, retry }`.
7. **Key resolution.** `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is read first, then `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`. If neither is set, the hook returns `unconfigured` without making a network call.
8. **No rider-location bias.** Because `origin` doesn't rank results (see 4), `SearchView` does not request the rider's location. This also avoids a location-permission prompt on the search screen.
9. **Session recents.** These live in a small in-memory module (`mobile/src/data/sessionRecents.ts`) as `readonly SearchPlace[]`, capped at 5, deduped by place id, and shown before the sample recents. A module keeps the list alive while `SearchView` unmounts during navigation, without touching `HomeScreen`.
10. **Shared place type.** `SearchPlace = { id, title, subtitle, location? }` replaces `MockSearchPlace` across the search UI. Suggestions map `structuredFormat.mainText`/`secondaryText` to title/subtitle.

## Risks / Trade-offs

- [Client-side key is visible in the web bundle and the app binary] → Restrict the key in Google Cloud to Places API (New) only and add an HTTP-referrer restriction for web. A backend proxy is a follow-up before public release.
- [Android/iOS app restrictions on the key need the `X-Android-Package`/`X-Android-Cert` or `X-Ios-Bundle-Identifier` headers on REST calls] → For the prototype, rely on API restriction only. Add bundle headers later if app restrictions are enabled.
- [Places API (New) not enabled on the project] → Requests return 403 and the UI shows the error state. The setup step is documented in the README task.
- [Debounce adds latency] → 300 ms is a common balance. It is a single constant if it needs tuning.
- [Dropping the visual pins removes the at-a-glance sense of where results are] → Each row's address line carries the location. A map preview can come back later on Route Results.
