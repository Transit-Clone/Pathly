# Design

## Context

- **Search today:**
  - `mobile/src/data/placesSearch.ts` calls Places API (New) `places:autocomplete`, limited to the service-area rectangle. It maps each `placePrediction` to `SearchPlace { id, title, subtitle, location? }`, ignoring `types`.
  - `usePlacesSearch` debounces by 300 ms and drops stale responses.
  - `SearchView` draws every row with a `place` (or `recent`) icon.
  - Selecting a suggestion calls `fetchPlaceDetails` (the same session token) for its coordinates.
- **What Google returns:** each `placePrediction` includes `types`, the place's Table A/B types. Stations carry `transit_station` plus a specific type (`subway_station`, `train_station`, `bus_station`, `light_rail_station`, or `ferry_terminal`). Google doesn't list the lines serving a station. The autocomplete field mask returns `types` by default, so there's no extra cost.
- **Pathly's stop data (backend):**
  - `loadAgencyStaticData(agency)` gives `stopsById` (`GtfsStop { stopId, name, lat, lon, parentStation }`) and `routesById` (`GtfsRoute { routeId, shortName, name, color }`).
  - `loadGlobalStopRouteIndex(agency)` maps a stop ID to the route IDs serving it.
  - This covers four agencies (LIRR, subway, NICE, Suffolk), and more once `mta-bus-and-ferry` lands.
  - The client has no stop catalog: Nearby is fetched per location with `findNearbyTransit`.
- **Badges:** `RouteBadge` takes `agency`, `color`, `shortName`, `mode`, and `textColor`. `badgeLabel` makes LIRR branch codes.

## Goals / Non-Goals

**Goals:**
- Stations and stops are recognizable at a glance: a mode icon plus their lines.
- No added latency for Google's suggestions, and no Google cost for stop results.
- One row per station.

**Non-Goals:**
- Fuzzy or typo-tolerant matching beyond normalization.
- Live departures in search.
- Stops outside the agencies Pathly has data for.

## Decisions

### 1. Stop search is a backend callable over an in-memory index
- **Callable:** `searchTransitStops({ query, near?: { lat, lng } })` returns up to 4 `StopSuggestion`s:
  ```ts
  type StopSuggestion = {
    id: string;                 // `${agency}:${stationKey}`
    name: string;
    agencyLabel: string;        // "LIRR", "NYC Subway", "NICE Bus", "Suffolk County Transit"
    mode: 'subway' | 'bus' | 'rail';
    location: { lat: number; lng: number };
    routes: { shortName: string; color: string; textColor?: string }[];
  };
  ```
- **Why the backend:** the GTFS data is already loaded and cached in Functions. A client bundle of every stop and route would add several MB to the app.
- **Index** (`src/stopSearch.ts`, built once per instance on first call, about 30k stops):
  - **Station grouping:** stops sharing a `parentStation` become one entry (subway and LIRR). Otherwise, stops with the same normalized name within 150 m of each other are merged, which covers bus stops with one ID per direction.
  - **Routes:** the union of the members' routes from `loadGlobalStopRouteIndex`, sorted by the agency's route order (numeric-aware).
  - **Normalized name:** lowercase, `&` → `and`, punctuation removed, `st`/`street`, `av`/`ave`/`avenue`, and `rd`/`road` unified, whitespace collapsed. Each entry keeps its tokens.
- **Matching:**
  - The normalized query must be at least 2 characters.
  - Score: 3 when the whole name equals the query or starts with it; 2 when every query token is a prefix of some name token; 1 when the name contains the query; 0 means no match.
  - Ties go to the nearer stop to `near`, then the shorter name. The top 4 are returned.
- **Limits:** `protectedCallableOptions` with `RATE_LIMITS.searchTransitStops = { userPerMinute: 60 }`. Typing is debounced, so a rider sends about one request per pause.

### 2. The client runs both searches at once
- `usePlacesSearch` calls `autocompletePlaces` and `searchTransitStops` in parallel for the same debounced query, each with its own stale-response guard.
- **Merge:**
  - `stops.slice(0, 3)`, then Google's predictions minus the duplicates.
  - A **duplicate** is a Google prediction whose types include `transit_station`, `subway_station`, `train_station`, `bus_station`, `light_rail_station`, or `ferry_terminal`, and whose normalized main text equals (or starts with) a listed stop's normalized name.
  - The same normalizer runs on both sides. It's shared as a small pure module, copied to the client the way `tripPlanning` types are mirrored.
- **Timing:** Google's rows render as soon as they arrive. When stops come later, they're inserted above them, and Google's order doesn't change.
- **Errors:** a stop-search failure is silent. The search status (loading, empty, error) follows Google's request, as today, so the existing states don't change. When Google returns nothing but stops match, the stops show and "No places found" doesn't.

### 3. `SearchPlace` carries a kind
- `SearchPlace` gains:
  - `kind?: 'place' | 'subway' | 'rail' | 'bus' | 'ferry'`;
  - `routes?: StopSuggestion['routes']`;
  - `source?: 'google' | 'pathly'`.
- A Google prediction's kind is the first matching type: `subway_station` → subway; `train_station`/`light_rail_station` → rail; `bus_station` → bus; `ferry_terminal` → ferry; a plain `transit_station` → rail. Anything else is a place.
- Pathly stops carry `location` already, so `SearchView`'s select handler skips `fetchPlaceDetails` when `location` is set. This is the same check it already makes for resolved recents.

### 4. Row presentation
- **Icon:** `subway`, `rail`, `bus`, a new `ferry` glyph (Ionicons `boat-outline`), or `place`.
- **Pathly stops:**
  - the primary line is the stop name;
  - under it, a row of `RouteBadge size="small"` (up to 6) and a muted "+N";
  - then the agency label, muted;
  - the accessibility label reads "Jamaica, LIRR station, lines E, J, Z, and 5 more".
- **Google rows:** unchanged except for the icon.
- **Recents:** a recent created from a stop keeps its kind and routes, so its icon and badges come back too. They're stored in the existing recent-search record. Older records have no kind and use the pin.

## Risks / Trade-offs

- [Station grouping is wrong for some bus stops, for example the same name on parallel streets] → The merge needs the same name within 150 m. The worst case is two rows with the same name, and their secondary lines differ.
- [A first-call index build adds latency] → It's built lazily once per instance (tens of ms over the cached stops), and the backend warm-up can call it.
- [Google's name for a station differs from GTFS, so a duplicate slips through] → Prefix matching after normalization catches most cases ("Jamaica" vs "Jamaica Station"). A missed duplicate shows the same station twice, not wrong data.
- [More requests per keystroke pause] → One extra callable per pause, rate-limited, with no Google billing.

## Migration Plan

Deploy the functions first. The client treats a missing callable as a silent stop-search failure, so the order doesn't matter much.

## Open Questions

- Should the home map's search-center pin also accept a stop and open its route detail instead of Route Results? That's out of scope here.
