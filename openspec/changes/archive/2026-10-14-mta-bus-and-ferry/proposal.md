# Proposal

## Why

Pathly covers the subway, LIRR, NICE, and Suffolk, but not New York City's buses (NYC Transit's five boroughs and MTA Bus Company, including the SBS and express routes like the SIM3C) or NYC Ferry. Google's trip planner already routes riders onto these, so Route Results shows trips on buses Pathly knows nothing about. Their legs get no stop lists or fares from Pathly's data, they never appear in Nearby, and they can't be opened as routes. For a rider in the city, the bus network is most of the system.

## What Changes

- **Seven new agencies in the GTFS backend**, each a config entry in `gtfsAgencies.ts`, using the existing static pipeline (scheduled download → Cloud Storage snapshot → prepared indexes):
  - NYC Transit buses: Bronx, Brooklyn, Manhattan, Queens, and Staten Island. These are MTA's five per-borough feeds, `rrgtfsfeeds.s3.amazonaws.com/gtfs_{bx,b,m,q,si}.zip`.
  - MTA Bus Company: `gtfs_busco.zip`.
  - NYC Ferry: `nycferry.connexionz.net/rtt/public/resource/gtfs.zip`.
- **Live data:**
  - **Buses:** MTA Bus Time's GTFS-realtime trip updates and vehicle positions (`gtfsrt.prod.obanyc.com`), one system-wide feed for all six bus agencies. They need a free MTA Bus Time developer key, stored as the new `MTA_BUS_TIME_API_KEY` secret. This replaces the SIRI-adapter plan noted in `gtfsAgencies.ts`, because Bus Time also publishes GTFS-RT.
  - **NYC Ferry:** GTFS-realtime trip updates. NYC Ferry publishes no vehicle positions, so ferry routes show predictions but no live boats on the map.
  - Without the bus key, bus routes still work on scheduled times, shown as untracked, as other agencies already do when their feed fails.
- **Snapshot limits sized for bus feeds:** the Brooklyn feed alone is a 19.6 MB ZIP, over the current 16 MB archive cap, and its `stop_times.txt` is far larger than the current 1M-row cap. Limits become per-agency, and `stop_times` preparation is streamed per route so a large feed never sits in memory whole.
- **Ferry as a mode:**
  - A new `ferry` transit mode with its own badge shape and boat icon.
  - A "Ferry" option in Route Results' Modes.
  - Google's `FERRY` vehicle type maps to it, instead of falling into "other".
- **Fares:** MTA bus legs (local, SBS, and express) are already priced by `tripFares.ts` once their Google agency names are recognized. NYC Ferry's single-ride fare is added, sourced and dated like the others.
- **What riders get:** city buses and ferries in Nearby, their route detail and departures pages, stop lists on their trip legs (via `trip-stops-and-interactive-map`), and their stops in search (via `transit-aware-search`). None of this needs new screens.

### Not in this change
- The Staten Island Ferry (NYC DOT), Staten Island Railway, Metro-North, and NJ Transit.
- Service alerts, even though Bus Time and NYC Ferry both publish alert feeds.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Added:** "City buses and NYC Ferry are covered" (Nearby, route detail, departures, live data, and scheduled fallback for the seven new agencies).
  - **Added:** "Ferry is a trip mode" (Google's ferry legs are recognized, and Modes can include or exclude them).
- `mobile-ui-design`:
  - **Added:** "Ferry route identity" (the ferry badge shape and icon).

## Impact

- **Backend (`firebase/functions`):**
  - `gtfsAgencies.ts`: `AgencyId` gains `bx`, `bk`, `mn`, `qn`, `si`, `busco`, and `nycferry`, with a shared Bus Time feed builder.
  - `gtfsSnapshots.ts`: per-agency size limits and a streamed `stop_times` derivation.
  - `index.ts`: the `MTA_BUS_TIME_API_KEY` secret on the live-status callables.
  - `tripFares.ts`: the NYC Ferry fare and MTA bus agency names.
  - `tripPlanning.ts`: the `FERRY` mode.
  - The static data for the new agencies is **not** committed to git (it's tens of MB per borough). It comes only from Cloud Storage snapshots, with small committed fallbacks just for tests.
- **Mobile (`mobile/src`):** the `TransitMode` and `TripMode` unions gain `ferry`, plus `RouteBadge`, `Icon`, the Route Results Modes chip, `RouteDetailView`'s agency table, and `transitModeForAgency`.
- **Operations:**
  - The deployer registers for an MTA Bus Time key and sets the secret.
  - The first scheduled refresh downloads about 60 MB of ZIPs.
  - Function memory for the GTFS updater may need raising, which is measured in task 1.1.
- **Requires redeploying functions.**
