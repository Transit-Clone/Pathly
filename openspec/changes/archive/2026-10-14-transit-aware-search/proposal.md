# Proposal

## Why

When a rider types a destination, every suggestion looks the same: a pin, a name, and an address. A subway station, a bus stop, an LIRR station, and a shop with a similar name can't be told apart, and nothing says which lines stop where. Citymapper and Google Maps show station results with their lines ("Jamaica · E J Z · LIRR"), which is often how riders recognize the place they mean.

Google's autocomplete can't do this on its own. Each suggestion has a `types` list (`subway_station`, `bus_station`, `train_station`, `transit_station`, `light_rail_station`, `ferry_terminal`, …), so Pathly can tell that a suggestion is a station. But Google doesn't say which lines serve it, and it rarely suggests ordinary bus stops at all. Pathly's own GTFS data has every stop and the routes serving it, for the subway, LIRR, NICE, and Suffolk, so it can supply both.

## What Changes

- **Transit stops in search.**
  - While the rider types, Pathly also searches its own stops by name, in parallel with Google's suggestions.
  - Matching stations and stops appear first (up to 3), each with a mode icon (subway, bus, rail), the stop name, and the route badges of the lines serving it, in their own colors and shapes (`E` `F` `R`, `S1` `S27`, `PJ`).
  - A stop served by many lines shows the first six badges and "+N".
  - Selecting a stop opens Route Results to that stop's exact location, with no Google Place Details call (Pathly already knows the coordinates).
- **Google suggestions say what they are.**
  - Each Google suggestion's icon follows its type: a subway, train, bus, or ferry icon for transit stations, and the location pin for everything else.
  - A Google suggestion for a station Pathly already listed (same normalized name, a transit type) is dropped, so a station doesn't appear twice.
- **Ordering:**
  - Pathly's stops first, ranked by how well the name matches (whole name, then word start, then anywhere in the name), with ties broken by distance from the rider.
  - Then Google's suggestions in Google's order.
- **Unchanged:** if Pathly's stop search fails or is slow, Google's suggestions still show on their own. Recents, service-area limits, and the loading, empty, and error states keep working as before.

### Not in this change
- MTA buses and NYC Ferry stops: they appear automatically once `mta-bus-and-ferry` adds their GTFS data.
- Live departures inside search rows.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `destination-search`:
  - **Modified:** "Live place suggestions" (transit stops from Pathly's data first; each row's icon shows what kind of place it is).
  - **Modified:** "Selecting a suggestion resolves the place" (a transit stop is already resolved, so no details request).
  - **Added:** "Transit stop suggestions show their lines".

## Impact

- **Backend (`firebase/functions`):**
  - New `searchTransitStops` callable (`protectedCallableOptions`, rate limit `userPerMinute: 60`).
  - New `src/stopSearch.ts`: an in-memory index of searchable stops built from each agency's GTFS stops and the route index, with stations merged.
  - Tests.
- **Mobile (`mobile/src`):**
  - `data/placesSearch.ts`: `SearchPlace` gains optional `kind` and `routes`, and autocomplete requests `types`.
  - New `data/stopSearch.ts` client.
  - `usePlacesSearch` merges both sources.
  - `SearchView` rows gain the mode icon and route badges.
- **Cost:** stop search uses Pathly's own data, with no Google cost. Selecting a stop skips one Place Details call.
- **Requires redeploying functions.**
