# Design

## Context

- **Agency model:** `gtfsAgencies.ts` declares one `AgencyConfig` per agency. Each config has `id`, `displayName`, `dataDir`, `staticFeedUrl`, `requiredStaticFallbacks`, `directionalStops`, `realtimeTripIdsMatchStatic`, and `feedRequestsForRoute`. The rest of the backend (static data, realtime, status, schedule, discovery) iterates over `AGENCY_CONFIGS`. The file's header already anticipates MTA buses, but assumes Bus Time is SIRI-only.
- **Static pipeline:**
  - `refreshGtfsStaticData` (scheduled) downloads each `staticFeedUrl` and validates it in `gtfsSnapshots.ts`.
  - It extracts the runtime files, builds derived indexes (stop indexes, per-route `stop_times`, geometry), and publishes a versioned snapshot to Cloud Storage. Instances hydrate from that snapshot.
  - Fixed caps: `MAX_ARCHIVE_BYTES` 16 MB, `MAX_EXTRACTED_BYTES` 64 MB, `MAX_DERIVED_ARCHIVE_BYTES` 32 MB, `MAX_DERIVED_EXTRACTED_BYTES` 160 MB, and `MAX_STOP_TIME_ROWS` 1,000,000.
  - The four current agencies also have committed copies under `static_data/` (about 140 MB total) as a fallback.
- **Feed sizes** (measured by HEAD request, 2026-10-14): the ZIPs are Bronx 9.6 MB, Brooklyn 19.6 MB, Manhattan 9.5 MB, Queens 6.8 MB, Staten Island 7.5 MB, MTA Bus Co 9.6 MB, and NYC Ferry 36 KB. For comparison, the subway is 5.6 MB.
- **Realtime sources:**
  - MTA Bus Time GTFS-RT: `https://gtfsrt.prod.obanyc.com/{tripUpdates,vehiclePositions,alerts}?key=…`. This is one feed for every NYCT and MTA Bus Co route, and it needs a developer key.
  - NYC Ferry GTFS-RT: `…/gtfsrealtime.aspx/tripupdate` and `/alert`. There are no vehicle positions.
- **Client modes:**
  - `TransitMode = 'subway' | 'bus' | 'rail'` (in `RouteBadge`) and `TripMode` (in `tripPlanning`).
  - `modeForVehicle` maps Google's `FERRY` to `'other'`, which is drawn as a bus.

## Goals / Non-Goals

**Goals:**
- City buses and NYC Ferry work in every existing feature, through configuration rather than new code paths.
- Large bus feeds are handled without OOMs or a bloated repository.
- The app degrades to scheduled times without the Bus Time key.

**Non-Goals:**
- Service alerts.
- The Staten Island Ferry, Staten Island Railway, and Metro-North.
- A merged "MTA Bus" agency in the UI. Riders see route names, not borough feeds.

## Decisions

### 1. One agency per published feed
- **IDs:**
  - `bx`, `bk`, `mn`, `qn`, `si`: NYCT buses, with display name "MTA Bus" and an internal suffix for the borough;
  - `busco`: MTA Bus Company, also displayed as "MTA Bus";
  - `nycferry`: displayed as "NYC Ferry".
- **Why not merge the six bus feeds:** each published feed already maps 1:1 onto `AgencyConfig`. The snapshot pipeline, derived indexes, and discovery work per agency unchanged. Route IDs don't collide across these feeds (`B44`, `Q10`, `SIM3C`), and every bus route links to the same Bus Time feed.
- **Bus config:**
  - `directionalStops: true`. NYCT bus stops are one per direction, with no `parent_station`.
  - `realtimeTripIdsMatchStatic`: verified in task 1.2 against a live feed sample, and set from that result.
- **Feeds:** a shared `busTimeFeedRequests()` returns the `tripUpdates` and `vehiclePositions` URLs with `key=${process.env.MTA_BUS_TIME_API_KEY}`, the same shape as `swiftlyFeedRequests`. The per-route filter that already runs over agency-wide feeds keeps only that route's entities.
- **Ferry config:** a trip-updates-only feed. The live map's vehicle layer simply gets no vehicles.

### 2. Per-agency limits and streamed stop times
- `AgencyConfig` gains optional `snapshotLimits` to override the archive, extracted, and derived byte caps and the stop-time row cap. The bus agencies get about 32 MB archive, 400 MB extracted, and 8M rows. The exact numbers are set from task 1.1's measurement, with headroom.
- Derived stop times are written per route while streaming `stop_times.txt` line by line, using the existing `readCsv` boundary but not holding all rows. Each route's rows are buffered by `trip_id` order and flushed to `derived/stop_times/<route>.json` when the route's trips finish (stop times are grouped by trip in MTA feeds; a fallback spills out-of-order rows to a temporary file). The 1M row cap was a memory guard, so it's replaced by a peak-memory test instead.
- The updater function's memory rises to the smallest size that passes the Brooklyn feed in task 1.1. The other callables don't change, because instances hydrate prepared per-route files lazily.

### 3. No committed static data for the new agencies
- `requiredStaticFallbacks` becomes optional. For the new agencies, the fallback is a small fixture (a few routes and stops) under `test/fixtures/gtfs/<agency>/`, used only by tests.
- In production, a missing snapshot means that agency is skipped in discovery, the same as an agency whose snapshot failed validation. It doesn't crash. This keeps the repository from growing by around 300 MB.

### 4. Ferry mode end to end
- `TransitMode` and `TripMode` gain `'ferry'`. `modeForVehicle('FERRY') → 'ferry'`.
- **Badge:** a fully rounded pill with a boat glyph before the name. Its shape and icon set it apart from the subway circle, bus rounded square, and rail tag. The icon is Ionicons `boat` / `boat-outline`, added as `ferry`.
- **Modes chip:** "Ferry". Google's `allowedTravelModes` has no ferry option, so excluding Ferry only filters on the client. When Ferry is the only excluded mode, all modes are still sent to Google.
- **Fare:** NYC Ferry's published one-way fare, with its source and effective date in `tripFares.ts`. A ferry leg doesn't take part in OMNY transfers.

### 5. Recognizing MTA bus agencies from Google
- `tripFares.ts`'s `OMNY_AGENCIES` already lists "MTA New York City Transit" and "MTA Bus Company".
- `trip-stops-and-interactive-map`'s agency table maps both to the borough agencies by the step's stop location (each borough feed covers its own stops). It tries every bus agency's stop index, so a route that crosses boroughs (for example the Bx and M routes on the Harlem bridges) still matches.

## Risks / Trade-offs

- [Updater memory and time for about 60 MB of ZIPs] → Streamed derivation, per-agency limits, a raised memory size for the updater only, and agencies refreshed sequentially. Task 1.1 measures them before the limits are committed.
- [Bus Time key missing or rate-limited] → Scheduled fallback, marked untracked. Live bus requests reuse the existing per-route batching and caching, and Bus Time's documented limits are respected (one request every 30 s per feed).
- [Nearby gets crowded in Manhattan, where dozens of routes are within walking distance] → The existing density-adaptive nearby search ("Nearby search adapts to density") already caps by distance and count. Tests cover a Midtown point.
- [Trip ID mismatch between Bus Time and static GTFS] → `realtimeTripIdsMatchStatic` is set from the observed data. If they don't match, the existing "pad with later scheduled departures" behavior applies.
- [NYC Ferry's feed is HTTP for static data] → It's fetched server-side only, and validated as a ZIP like the other feeds.

## Migration Plan

1. Register for the Bus Time key: `firebase functions:secrets:set MTA_BUS_TIME_API_KEY`.
2. Deploy the functions. The scheduled refresh (or a manual trigger) publishes the first snapshots for the new agencies. Until then, they're skipped.
3. Ship the client with the ferry mode. Older clients draw ferry legs as "other", as today.
4. Rollback: remove the agencies from `AGENCY_CONFIGS`. Their snapshots are ignored.

## Open Questions

- Should the Staten Island Ferry (NYC DOT's GTFS on data.gov) come in now as an eighth agency? It's small and has no realtime feed. It's left out unless asked for.
- **Found while measuring (task 1.1):** prepared stop times for the six bus feeds total about 500 MB, and instances currently write every agency's prepared files into `/tmp`, which is held in memory. Before decision 2 can land, instances need one of:
  - reading per-route prepared files from Cloud Storage on demand, instead of hydrating them all;
  - more memory per transit instance;
  - a smaller bus timetable (per-route stop patterns plus headways instead of every trip's times), which would drop exact scheduled bus times and stop lists.

