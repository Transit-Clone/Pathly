# Proposal

## Why

The Port Jefferson Branch map draws live trains without saying how current they are. It mixes both directions, and it includes trains whose last GPS fix is hours old: the live feed had fixes 11 and 20 hours old in a sample. That makes the train markers look random. The route also always opens on the whole branch and shows departures from Stony Brook, regardless of where the rider actually is.

## What Changes

- **Freshness:**
  - Each train marker gets a small circular badge at its top-right showing the age of that train's own GPS fix (`3s`, `1m`, `2h`), counting up every second.
  - Trains older than 5 minutes are hidden.
  - Live data refreshes every 15 s instead of every 30 s.
- **Direction:** the map shows only trains traveling in the currently selected direction, and switches with the direction pager.
- **Nearest station:**
  - Using GPS, the app picks the Port Jefferson Branch station nearest to the rider, falling back to Stony Brook.
  - The route map opens zoomed on that station and emphasizes its dot.
  - Live departure predictions on the home card and the route-detail tiles come from that station.
  - The stop timeline is timed so that the nearest station matches the first prediction.
- **Backend:** the `getLirrBranchLiveStatus` Cloud Function returns each vehicle's GPS timestamp. **This requires deploying functions** (`firebase deploy --only functions`). Until then, the app treats trains without a timestamp as having an unknown age: it shows no age badge and doesn't hide them.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mobile-ui-design`: adds "Live train freshness", "Live trains follow the selected direction", and "Live route map opens on the nearest station".
- `mobile-prototype-navigation`: adds "Live departures follow the nearest station".

## Impact

- **Backend**:
  - `firebase/functions/src/lirrStatus.ts` (vehicle `timestamp`).
  - `firebase/functions/src/types/gtfs-realtime-bindings.d.ts`.
- **App**:
  - `mobile/src/data/lirrLive.ts` (`updatedAt`) and `mobile/src/data/LirrLiveContext.tsx` (15 s poll).
  - `mobile/src/data/portJeffersonGeometry.ts` (GTFS `stopId` per station).
  - New `mobile/src/data/nearestStop.ts`.
  - `mobile/src/components/HomeScreen.tsx` (live stop and nearest stop passed down).
  - `mobile/src/components/RouteDetailView.tsx` (direction, focus stop, timeline anchor).
  - `mobile/src/components/LirrRouteMap.native.tsx` and `LirrRouteMap.web.tsx` (filtering, age badge, focus).
- **Cost**: roughly twice the Cloud Function invocations while live data is on screen.
- **Related**: the larger train icon and the stop-popup fix are tracked in `refine-route-detail-ui`, which owns those markers.
