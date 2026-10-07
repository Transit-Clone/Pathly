# Proposal

## Why

Destination search only matches a handful of hard-coded mock places, so riders can't look up a real address or landmark. The search screen also places its results in a floating sheet over an illustrated map with fake numbered pins. That layout doesn't match the familiar Google Maps search experience and makes the list harder to scan.

## What Changes

- **Phase 1: Search screen UI cleanup (done first)**
  - Remove the illustrated map backdrop and the numbered mock map pins from the destination-search screen.
  - Replace the floating results sheet with a standard full-screen search layout: a plain white screen (the theme's surface color, which is dark in the dark theme), the search field pinned at the top, and the results list directly below it, filling the rest of the screen.
  - The home screen, its Google map and current-location control, Route Results, route detail, and trip detail are unchanged.
- **Phase 2: Google Maps search**
  - Replace mock destination matching with Google Places Autocomplete (Places API (New)), restricted to the Pathly service area (NYC, Nassau, Suffolk), so out-of-area places are never suggested.
  - Present suggestions the way Google Maps does: a place icon, the place name in bold, and its address on a second line.
  - Show loading, no-results, and error/unconfigured states in the results list.
  - When the rider selects a suggestion, resolve its details (name, formatted address, coordinates) and open Route Results with that place as the destination. Itineraries stay mock data.
  - Selected places are added to the session's recent searches (in memory only, no backend).

## Capabilities

### New Capabilities
- `destination-search`: Google Places–backed destination lookup. It covers query debouncing, service-area restriction, result presentation, place-detail resolution on selection, session recents, and graceful handling when the API key is missing or requests fail.

### Modified Capabilities
- `mobile-ui-design`: The search screen no longer shows the illustrated map ("Illustrated street map" now applies only to the home and Route Results screens). The search results become a full-screen list instead of a sheet ("Consistent search sheet heading").
- `mobile-prototype-navigation`: Search selection opens Route Results with a resolved Google place ("Search selection opens route results"). Destination search is exempt from the local-only rule and must degrade gracefully ("Expanded prototype remains local").

## Impact

- **Code**: `mobile/src/components/SearchView.tsx`, a new `mobile/src/data/placesSearch.ts` (Places client) and `mobile/src/hooks/usePlacesSearch.ts`, a new `mobile/src/data/sessionRecents.ts`, `mobile/src/data/mockSearch.ts` (recents only), and tests in `mobile/__tests__/`.
- **APIs/config**: Places API (New) must be enabled on the Google Cloud project. A new `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` env var is added, falling back to the existing web Maps key. Requests are billed per autocomplete session.
- **Dependencies**: none new (uses `fetch`).
