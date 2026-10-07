# Tasks

## 1. Phase 1: Full-screen search page

- [x] 1.1 In `mobile/src/components/SearchView.tsx`, remove `MapBackdrop`, the numbered map-pin overlay and its styles, the absolute rounded results sheet, the `sheetHeight`/`mapHeight`/`screenWidth` math, and the keyboard-height listener. Lay out the screen as a `colors.surface` column with the search row pinned at top and a `flex: 1` scrollable list below. Remove the `pin` field from `MockSearchPlace` in `mobile/src/data/mockSearch.ts`. Verify with `npm run typecheck` in `mobile/`, and confirm on web (`npm run web`) that search is a plain white page with the field on top and "Recent" directly below, plus a dark surface in the dark theme.
- [x] 1.2 Restyle result rows in the Google Maps style: a `place` pin icon for matches and a `recent` clock icon for recents in a round icon well, a bold title, a muted subtitle, and hairline dividers, with no number badges or chevron. Remove the "Matches" heading and count, and keep the "Recent" label for the empty query. Verify on web in light and dark themes.
- [x] 1.3 Update `mobile/__tests__/` for the new layout: assert that no `map-backdrop` and no "Map result" pins render with a query active, that no `search-match-count` exists, and that "Recent" shows for an empty query. Fix any tests that relied on the old sheet, pins, or count. Verify that `npm test` and `npm run lint` pass.

## 2. Places client

- [x] 2.1 Create `mobile/src/data/placesSearch.ts` with a `SearchPlace` type, `getPlacesApiKey()` (Places key, falling back to the web Maps key), `autocompletePlaces({ input, sessionToken, origin, signal })` (location restriction set to `SERVICE_AREA_BOUNDS`, `includedRegionCodes: ['us']`), and `fetchPlaceDetails({ placeId, sessionToken, signal })` (field mask: id, displayName, formattedAddress, location). The key is sent only in the `X-Goog-Api-Key` header. Verify with new unit tests in `mobile/__tests__/placesSearch.test.ts` that mock `fetch` and assert request URL, headers, body, response mapping, and errors on non-2xx responses.
- [x] 2.2 Add `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` to the env example/README setup, with steps to enable Places API (New) and restrict the key. Verify the README section lists the variable and the Google Cloud steps.

## 3. Search hook

- [x] 3.1 Create `mobile/src/hooks/usePlacesSearch.ts` with a 300 ms debounce, `AbortController` cancellation, a guard that drops responses for stale queries, a session token that rotates after a selection, a `retry()` function, and statuses `idle | loading | success | error | unconfigured`. Verify with hook tests using fake timers: no request for an empty query, one request after a burst of typing, stale responses ignored, `unconfigured` without a key, and `error` and then `success` after `retry()`.

## 4. Search UI integration

- [x] 4.1 Wire `usePlacesSearch` into `SearchView` in place of `findMockDestinations`. Render loading, "No places found", error with Retry, and "Place search is unavailable" states, each in an `accessibilityLiveRegion`. Verify with component tests that cover each state and that suggestion rows show the pin icon, the bold name, and the address.
- [x] 4.2 On suggestion press, call `fetchPlaceDetails` and show a per-row progress indicator, ignoring presses while it resolves. On success, call `onSelect` with the resolved place. On failure, stay on the screen and show an error. Verify with a test that selection opens Route Results with the resolved display name, and a test that a details failure keeps the search screen open.
- [x] 4.3 Add session recents in `mobile/src/data/sessionRecents.ts` (in memory, at most 5, deduped by id, most recent first, followed by the sample recents) and read them in `SearchView`. `HomeScreen.tsx` is not modified. Selecting a recent opens Route Results without a Places request. Verify with a test that picks a place, reopens search, sees it first under "Recent", and confirms `fetch` was not called when the recent is selected.

## 5. Integration check

- [x] 5.1 Run `npm run typecheck`, `npm run lint`, and `npm test` in `mobile/`. Then on web with a real key, search for "Stony Brook University", "100 Nicolls Rd", and a nonsense string, and confirm the suggestions, Route Results navigation, and empty state behave as the `destination-search` spec describes.
