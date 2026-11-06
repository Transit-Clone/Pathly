# Design

## Context

- **Agency model:** one `AgencyConfig` per agency in `gtfsAgencies.ts`. The closest existing analogues are `nycferry` and `siferry`: small feeds with `onDemandRouteFiles: true`, `stopBounds`, no committed `static_data/` copy, and (for `siferry`) no live feed (`feedRequestsForRoute: () => []`). Several backend tables are typed `Record<AgencyId, …>` (`gtfsDiscovery.ts` `MODE_WORDS` and `MODE_RANK`), so adding the id forces an entry there. Others are `Partial` (nearby distances) or hand-kept sets (`STEP_FREE_AGENCIES`, `STATION_AGENCIES`).
- **Client:** `LiveSource['agencyId']` in `mobile/src/data/transit.ts` mirrors `AgencyId`. Agency-keyed tables: `RouteDetailView` (`OWN_TRANSFER_KIND` and the agency/mode table), `SettingsPages` (`INBOX_AGENCY_NAMES`), `lineIndex.ts` (mode and search words), `lineLayers.ts`, `routeGeometry.ts`, and `routeColors.ts`. `RouteBadge.transitModeForAgency` defaults to `bus` for unknown agency names, and `AgencyLogo` is `Partial`, so SBU needs no entry there.
- **The feed** (downloaded and inspected 2026-11-05):
  - Static: `https://s3.amazonaws.com/etatransit.gtfs/stonybrook.etaspot.net/gtfs.zip`, 269 KB ZIP, 1.7 MB extracted, 16,627 `stop_times` rows. Within the default snapshot limits.
  - `feed_info`: publisher "ETA Transit Systems", `https://etatransit.com`, version 107, service 2025-11-21 to 2027-10-15. `agency.txt`: "Stony Brook University", agency_id 1, America/New_York.
  - 14 routes, all `route_type` 3, each with its own `route_color` and no `route_text_color`. Some colors are very light (`FAEC2A`, `B2CECA`, `FF84FB`). Route 2 is short-named "LIRR" (long name "Railroad"), and route 11 is "RR2" ("Railroad Sunday"). Route 25 is "Charter".
  - 68 stops, all `location_type` 0 with no `parent_station` and blank `wheelchair_boarding`. Stop bounds: lat 40.8626 to 40.9537, lon -73.1473 to -72.4423 (the east end is the Southampton campus).
  - All 1,641 trips are `direction_id` 0 with `trip_headsign` "Outbound". The useful label is in `stop_times.stop_headsign` (for example "HOSPITAL EXPRESS"). `calendar.txt` has 21 semester-scoped services. `fare_attributes.txt`, `frequencies.txt` and `transfers.txt` are header-only.
  - Realtime, on the same public S3 prefix with no key: `trip_updates.pb`, `position_updates.pb` and `alerts.pb` all answered 200. Vehicle positions carry start times like `11:50:00-5`, which resemble the static `trip_short_name` format (`14:45:00-142`). Whether RT trip IDs equal static `trip_id`s is not yet verified.
- **Licensing:** neither Transitland's feed page nor its atlas record (`feeds/etaspot.net.dmfr.json` in transitland-atlas) carries a license block for this feed. The atlas's CC BY 4.0 covers Transitland's metadata, not the GTFS. ETA Transit's site shows only a general copyright notice. No SBU open-data or developer terms were found. See proposal.md, Why.

## Goals / Non-Goals

**Goals:**
- SBU buses work in every existing feature through configuration and data handling, with no new screen.
- The agency can be built, tested and deployed while it stays hidden from riders until permission is on record.
- Credit for every agency's data in one place.

**Non-Goals:**
- A generic "loop route" model for every agency. Only SBU's data needs it now, and it's handled where headsigns and directions are derived.
- Rewriting SBU's route names.

## Decisions

### 1. One agency, `sbu`, displayed as "SBU Transit"
- `id: 'sbu'`, `dataDir: 'sbu'`, `displayName: 'SBU Transit'` (the name SBU uses for its bus service). The name avoids the bare "SBU", which also appears in stop and place names.
- `onDemandRouteFiles: true` and no `requiredStaticFallbacks`, like `nycferry`: nothing gets committed, and the agency is skipped until a snapshot is published.
- `stopBounds: { south: 40.86, north: 40.96, west: -73.15, east: -72.44 }` (stops rounded outward). The rectangle is wide because of Southampton, but it still keeps cold starts in the city and western Nassau from loading SBU.
- `directionalStops: false`. Each stop is a single point served by one-direction loops, so `direction_id` is trustworthy as published (all 0).
- `realtimeTripIdsMatchStatic`: set by task 1.2's sample. It defaults to `false`, which is the safe setting.
- Nearby distances: `MAX_NEARBY_DISTANCE_METERS` 1,600 and `MAX_NEARBY_CAP_METERS` 6,000. The campus is dense and walkable, and a wider cap would list campus loops from the far side of Route 25A. `MODE_WORDS: 'bus'`, `MODE_RANK: 2`.
- **Alternative considered:** folding SBU into `suffolk`. Rejected because it's a separate feed, publisher, calendar and permission.

### 2. Release gate on permission
- `AgencyConfig` gains `requiresPermission?: 'SBU_DATA_PERMITTED'`, the name of a Firebase boolean param (`defineBoolean`, default `false`).
- While the param is false, the agency is treated exactly like an on-demand agency with no snapshot: skipped by discovery, search, status and trip matching. The scheduled refresh still publishes its snapshot, so turning it on needs no rebuild.
- Tests and the emulator set it to true.
- **Alternative considered:** leaving the agency out of `AGENCY_CONFIGS` until permission. Rejected because the `Record<AgencyId, …>` typing would force a second code change at release time, and the work couldn't be tested end to end.

### 3. Loops, headsigns and empty routes
- When every trip of a route shares one `direction_id` (true for every SBU route), route detail offers no direction switch. Existing behavior for routes with no direction-1 trips is checked in task 2.2, and only the gap is fixed.
- A trip whose headsign is a generic direction word ("Outbound", "Inbound", blank) takes the route's long name instead, or the first `stop_headsign` when the long name is empty. This is applied while preparing derived data, so it costs nothing at request time. It's keyed on the generic-word list, not on `sbu`, so another feed with the same quirk benefits.
- Routes with no trips in any active service (Charter, now) produce no prepared route files and are not listed. This falls out of the existing derivation and is checked by a test.

### 4. The "LIRR"-named shuttle
- SBU's published short names are kept: riders and SBU's own signage use them.
- The badge for an SBU route is always the bus shape, because `transitModeForAgency('SBU Transit')` is `bus`. `badgeLabel`'s LIRR branch-code mapping only runs for agency "LIRR", so it doesn't touch it.
- `lineIndex.ts`'s railroad search words already filter by `agencyId === 'lirr'`. A test locks that in.
- `gtfsDiscovery` station grouping (`STATION_AGENCIES`) does not include `sbu`, so the SBU stop at the station isn't merged into the LIRR station entry.

### 5. Colors
- `displayRouteColor` already uses the route's own color for agencies without special handling. SBU uses that.
- The light colors (`FAEC2A`, `B2CECA`, `FF84FB`) need dark badge text. Task 3.2 checks that the badge picks text color by contrast rather than assuming white, and adds that if it doesn't.
- `lineLayers.ts` gains `{ id: 'sbu', label: 'SBU Buses', icon: 'bus', agencies: ['sbu'] }`.

### 6. Realtime, gated twice
- When enabled, `feedRequestsForRoute: () => [trip_updates.pb, position_updates.pb]` on the S3 prefix (public, no secret), and `alertFeedRequests: () => [alerts.pb]`.
- This needs both the permission param (decision 2) and explicit realtime permission, because the feed is ETA Transit's hosted product. A second config switch, `liveFeedEnabled`, defaults to false, and `feedRequestsForRoute` returns `[]` until it's flipped.
- Polling respects the existing per-route batching and caching. The S3 objects are fetched no more often than the other agencies' feeds.

### 7. Trip planning and fares
- Google's Routes API may not carry SBU buses. Task 2.4 checks with a campus-to-station query. If Google does return them, `tripAgencies.ts` maps the agency name it reports to `['sbu']`; if not, nothing is added.
- Fares: SBU publishes no fares in the feed. The campus buses are believed to be free to ride; task 2.4 confirms this on SBU's site and prices SBU legs at $0 with a dated note in `tripFares.ts`.

### 8. Attribution in Help & About
- A "Transit data" row, next to the existing "Map data © OpenStreetMap" row, opens a list of every agency's data source. Each entry has the publisher name, a link, and any required wording. The list is built from one table, so new agencies add a line.
- SBU's entry is "Stony Brook University campus bus data, provided by Stony Brook University and ETA Transit Systems" unless SBU's permission asks for different text.
- The permission reply is saved as `firebase/functions/static_data/LICENSES.md` (or appended to it, if the file exists by then) with the date and the sender, so the requirement is checkable.

## Risks / Trade-offs

- [SBU declines or doesn't reply] → The gate stays off, and nothing is visible to riders. The code can stay in place, or be removed by deleting the config entry.
- [The S3 URL moves or the bucket closes] → The existing refresh keeps the last snapshot and logs the failure, like any agency.
- [The calendar is semester-scoped, so gaps appear during breaks] → This is correct behavior (spec scenario "Outside the service calendar"). Calendars past 2027-10-15 depend on SBU republishing.
- [RT trip IDs don't match static] → `realtimeTripIdsMatchStatic: false` pads live predictions with later scheduled departures, as for NICE.
- [Short name "LIRR" confuses riders] → The bus badge plus the "SBU Transit" agency label, with "Railroad" as the long name. If feedback shows confusion, a display-name override is a later, small change.

## Migration Plan

1. Send the permission email and record the reply (task 1.1).
2. Deploy the functions with `SBU_DATA_PERMITTED=false`. The scheduled refresh publishes the SBU snapshot. Verify it in the emulator or a test project with the param set to true.
3. Ship the client that knows `sbu`. While the gate is off, no client receives SBU routes, so older clients are unaffected.
4. With permission on record, set `SBU_DATA_PERMITTED=true`. With realtime permission too, flip `liveFeedEnabled` and redeploy.
5. Rollback: set the param to false.

## Open Questions

- The exact attribution wording, and whether SBU wants ETA Transit named. This comes from SBU's reply and changes only one string.
- Whether older clients handle an unknown `agencyId` gracefully (task 3.4 checks). If they don't, step 4 waits until most riders have the new client.
