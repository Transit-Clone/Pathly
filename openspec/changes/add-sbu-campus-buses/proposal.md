# Proposal

## Why

Stony Brook University (SBU) runs a campus bus network: the Outer and Inner Loops, Hospital Express, the Railroad shuttle to the Stony Brook LIRR station, Port Jefferson and shopping shuttles, and Southampton service. Pathly already covers the LIRR and Suffolk County Transit buses that SBU riders connect to, but not the campus buses, so a student's last mile at the Stony Brook station is missing from Nearby, route detail and departures. SBU's schedule data is published as GTFS (with GTFS-realtime) by its real-time vendor, ETA Transit Systems, and is listed on Transitland as `f-stony~brook~university~ny~us`. That makes it a configuration-level addition to the existing agency pipeline.

The feed has no published license (see design.md, Context). This change therefore treats written permission from SBU (and, if SBU points there, ETA Transit) as a precondition for shipping, and makes crediting the data source a requirement.

## What Changes

- **New agency `sbu`** ("SBU Transit"), one config entry in `gtfsAgencies.ts` using the existing static pipeline (scheduled download, Cloud Storage snapshot, prepared indexes). Feed: `https://s3.amazonaws.com/etatransit.gtfs/stonybrook.etaspot.net/gtfs.zip` (ETA Transit Systems, feed version 107, service 2025-11-21 to 2027-10-15, 14 routes, 68 stops, 1,641 trips; a 269 KB ZIP).
- **Static schedules first:** campus routes appear in Nearby near campus, at the Stony Brook LIRR station, in Port Jefferson and in Southampton. They open route detail and departures pages, and their stops are searchable. Departures are scheduled and shown as untracked.
- **Realtime as a gated follow-up inside this change:** the feed also publishes public GTFS-RT trip updates, vehicle positions and alerts on the same host. They are wired only after permission covers realtime use and the trip IDs are verified to match. Until then the agency has no live feed.
- **Data quirks handled:** every trip is `direction_id` 0 with headsign "Outbound" (the routes are loops), so route detail names the route rather than showing "Outbound". The feed has a route whose short name is "LIRR" (SBU's Railroad shuttle), which must not be mistaken for the Long Island Rail Road. Routes with no scheduled service, such as Charter, are left out.
- **Licensing and attribution:** written permission recorded in the repo before release. Help & About gains a transit data sources section that credits each agency's data, SBU's included, in the wording SBU asks for. No SBU logos or trademarks are used without permission.
- **Fares:** campus buses are priced as SBU publishes them (expected fare-free; confirmed in tasks), not left unpriced.

### Not in this change
- SBU's official logo in `AgencyLogo` (needs trademark permission; the badge uses the bus shape and route colors).
- Charter and event service, and Stony Brook Medicine shuttles not in the feed.
- Accessibility (step-free) flags for SBU stops: the feed leaves `wheelchair_boarding` blank.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `mobile-prototype-navigation`:
  - **Added:** "Stony Brook University campus buses are covered" (Nearby, route detail, departures, search, scheduled-only until realtime is enabled, loop naming, the "LIRR"-named shuttle).
  - **Added:** "Transit data sources are credited" (an attribution list in Help & About, and a permission precondition for third-party feeds without a published license).

## Impact

- **Backend (`firebase/functions`):**
  - `gtfsAgencies.ts`: `AgencyId` gains `sbu`, with `onDemandRouteFiles`, `stopBounds` and default snapshot limits.
  - `Record<AgencyId, …>` tables that must gain an entry: `gtfsDiscovery.ts` (`MODE_WORDS`, `MODE_RANK`, nearby distances), `stopSearch.ts` (mode), `routeColors.ts`.
  - `tripAgencies.ts`: map Google's SBU agency name, if Google routes these buses at all. `tripFares.ts`: the SBU fare.
  - No `static_data/` commit; small test fixtures under `test/fixtures/gtfs/sbu/`.
- **Mobile (`mobile/src`):** the `LiveSource['agencyId']` union in `transit.ts`, `RouteDetailView`'s agency table, `SettingsPages` (inbox agency names and the new data sources section), `lineIndex.ts` (mode and search words), `lineLayers.ts` (an "SBU Buses" map layer), `routeColors.ts`, and `routeGeometry.ts`. `RouteBadge` and `AgencyLogo` need no new shape and no logo. Other sessions currently have uncommitted edits in `RouteDetailView.tsx` and `SettingsPages.tsx`, so implementation must start after those land.
- **Legal / operations:** an email to SBU Mobility & Parking Services (`transportation@stonybrook.edu`) before release, with the reply archived in the repo. Requires redeploying functions and a client release.
