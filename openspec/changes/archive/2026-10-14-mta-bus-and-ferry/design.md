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

### 2. Per-agency limits and spilled stop-time derivation
- `AgencyConfig` gains optional `snapshotLimits` overriding the archive, extracted, and derived byte caps and the stop-time row cap. The bus agencies use 32 MB archive, 400 MB extracted, and 6M rows, from task 1.1's measurements (Brooklyn: 19.6 MB, 164.5 MB, 2.4M) with headroom. The derived-archive caps don't apply to on-demand agencies (decision 3), whose route files are published one by one.
- **Derivation** (`buildDerivedData`) no longer holds every row in memory: while scanning `stop_times.txt`, rows are appended to one spill file per route (newline-delimited JSON, flushed in batches). After the scan, each route's spill is read back alone to write its `stop_times/<route>.json` and geometry, so peak memory is one route plus the indexes. Output is byte-identical to today's for the existing agencies.
- **Updater size:** the scheduled refresh gets 4 GiB and a 30-minute timeout (from 1 GiB and 9 minutes). It stages each feed and its prepared output in `/tmp`, which is held in memory, and uploads a big feed's route files one by one. This wasn't measured end to end, since task 1.1 found today's pipeline rejected these feeds, so check the first runs' memory and duration in the logs. Callables keep 1 GiB, because on-demand agencies hydrate only their small files.

### 3. On-demand route files for the new agencies (option A, chosen 2026-10-14)
- **Why:** prepared stop times for the six bus feeds total about 500 MB as JSON (task 1.1). Writing them all into each instance's `/tmp` (held in memory) doesn't fit 1 GiB instances, and more memory would slow every cold start.
- **Config:** `AgencyConfig.onDemandRouteFiles: true` for the seven new agencies. The existing four keep today's archive-and-hydrate behavior.
- **Publishing** (scheduled refresh): an on-demand agency's prepared output is split. `manifest.json`, `stop-indexes.json`, and a new `route-files.json` (each route file's name, size, and sha256) form a small core archive, published as today's derived archive. Each `stop_times/<route>.json` and `geometry/<route>.json` is uploaded as its own object under `gtfs/v1/<agency>/derived/<version>/<derivedVersion>/`. The snapshot manifest's `derived` gains `routeFilesPrefix`.
- **Hydration:** an on-demand agency writes only the core files and the small raw files (routes, stops, trips, calendars, shapes) to `/tmp`. `stop_times.txt` isn't even extracted (the archive is unzipped with it filtered out, and its hash check is skipped, since the core's route-file hashes cover what's actually read).
- **Loading:** `loadRouteStopTimes` and `loadPreparedRouteGeometry` read a route's file from Cloud Storage on first use, verify its sha256 against `route-files.json`, and keep the parsed result in an LRU cache bounded by stop-time rows (1.5M rows across on-demand routes, about 150 MB). A missing or failed file reads as "no timetable" for that route, as for an unprepared route today.
- **No committed data:** the new agencies have no `static_data/` copy. `requiredStaticFallbacks` becomes optional. An on-demand agency without a published snapshot is skipped everywhere (discovery, search, status) instead of failing. Tests use small fixtures under `test/fixtures/gtfs/<agency>/` through a test-only data-directory override.
- **Cost:** a Cloud Storage read per route per instance on first use (Class B operations, effectively free at this scale). The first open of a bus route on a fresh instance adds one fetch, expected well under a second.

### 4. Ferry mode end to end
- `TransitMode` and `TripMode` gain `'ferry'`. `modeForVehicle('FERRY') → 'ferry'`.
- **Badge:** a fully rounded pill with a boat glyph before the name. Its shape and icon set it apart from the subway circle, bus rounded square, and rail tag. The icon is Ionicons `boat` / `boat-outline`, added as `ferry`.
- **Modes chip:** "Ferry". Google's `allowedTravelModes` has no ferry option, so excluding Ferry only filters on the client. When Ferry is the only excluded mode, all modes are still sent to Google.
- **Fare:** NYC Ferry's one-way fare by trip date: $4.50 before October 19, 2026 and $5.00 from then (NYCEDC fare change approved September 2026). A ferry leg doesn't take part in OMNY transfers.

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

- **Resolved:** the memory problem found in task 1.1 is handled by decision 3 (option A, on-demand route files), chosen over bigger instances and a lighter bus timetable.
