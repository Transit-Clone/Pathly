import { httpsCallable } from 'firebase/functions';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { functions } from '../lib/firebase';
import type { LiveSource, RouteDetail, TransitDirection } from './transit';

type DiscoveredDirection = { stopId: string; name: string; headsign: string | null } | null;

export type DiscoveredRoute = {
  agencyId: LiveSource['agencyId'];
  agencyDisplayName: string;
  routeId: string;
  routeName: string;
  shortName: string;
  /** Hex, with a leading "#". */
  color: string;
  distanceMeters: number;
  direction1: DiscoveredDirection;
  direction0: DiscoveredDirection;
};

type FindNearbyTransitResponse = { routes: DiscoveredRoute[] };

const findNearbyTransitCallable = httpsCallable<{ lat: number; lon: number }, FindNearbyTransitResponse>(
  functions,
  'findNearbyTransit',
);

/**
 * Every real nearby route, across every configured agency (LIRR, subway, NICE Bus, Suffolk
 * County Transit — gtfsAgencies.ts), sorted closest first — not a fixed handful of hand-picked
 * lines. Each result already carries both directions' real nearest stop (independently
 * resolved — see getNearestStopForRoute's own comment for why that matters), ready to convert
 * into a `RouteDetail` via `discoveredRouteToRouteDetail`.
 *
 * Throws on failure rather than swallowing it into an empty array — the caller needs to tell
 * "checked, nothing real is nearby" apart from "couldn't check," the same honest-state
 * principle applied everywhere else live data is fetched in this app.
 */
export async function fetchNearbyTransit(location: Coordinates): Promise<readonly DiscoveredRoute[]> {
  const { data } = await findNearbyTransitCallable({ lat: location.latitude, lon: location.longitude });
  return data.routes;
}

/** The real (agencyId, routeId) a `liveSource` identifies — the stable key used to tell "is this the same real line" apart from comparing `RouteDetail.id`s, which differ between a route's demo-catalog id (e.g. "ronkonkoma") and its synthesized discovered one (e.g. "lirr:10") even when they're the exact same real route. */
export function liveSourceKey(liveSource: Pick<LiveSource, 'agencyId' | 'routeId'>): string {
  return `${liveSource.agencyId}:${liveSource.routeId}`;
}

/**
 * Drops any discovered route that's the exact same real line as one of `pinnedRoutes` (e.g.
 * discovering LIRR route "10" near Stony Brook when the Port Jefferson Branch card — the same
 * real line, different id — is already pinned) so it isn't shown twice in the Nearby section.
 * Routes elsewhere in the demo catalog but *not* currently pinned are left alone — with the
 * Nearby tab now fully dynamic, that's the only way they'd ever be reachable from it, which is
 * correct: they're real nearby lines like any other, not special-cased just because this app
 * also happens to use them as Recents/Favorites illustrative scenarios.
 *
 * Operates on already-converted `RouteDetail`s (not raw `DiscoveredRoute`s) and is meant to be
 * a pure, render-time computation over whatever was last fetched — pin/unpin should never by
 * itself trigger a network re-fetch (a discovered route dropping out of the *raw* fetched list
 * while its own detail page happens to be open, mid-pin, would otherwise be able to kick the
 * rider back to Home — this keeps the full discovered set around for lookups regardless of
 * pin state, only filtering *what's displayed* in the Nearby section).
 */
export function filterOutPinnedDuplicates(
  discoveredRoutes: readonly RouteDetail[],
  pinnedRoutes: readonly RouteDetail[],
): RouteDetail[] {
  const pinnedKeys = new Set(
    pinnedRoutes
      .map((route) => route.liveSource)
      .filter((liveSource): liveSource is LiveSource => liveSource != null)
      .map(liveSourceKey),
  );
  return discoveredRoutes.filter((route) => !route.liveSource || !pinnedKeys.has(liveSourceKey(route.liveSource)));
}

/**
 * Builds a dynamically-discovered route into the same `RouteDetail` shape every other route
 * uses, so it works with the existing cards/detail page/live-data pipeline unchanged. Unlike
 * the demo catalog, there's no hand-authored illustrative map/stop data to fall back on — this
 * always has a `liveSource`, so RouteDetailView always uses the real backend-derived map and
 * timing instead, and never needs it.
 */
export function discoveredRouteToRouteDetail(discovered: DiscoveredRoute): RouteDetail {
  const { direction1, direction0 } = discovered;
  const fallbackStopId = direction1?.stopId ?? direction0?.stopId ?? '';

  const directionFor = (primary: DiscoveredDirection, other: DiscoveredDirection): TransitDirection => ({
    direction: primary?.headsign ? `Toward ${primary.headsign}` : 'Schedule unavailable',
    live: false,
    minutes: 0,
    stopName: primary?.name ?? other?.name ?? 'Unknown stop',
    stopId: primary?.stopId,
    unavailable: true,
  });

  return {
    agency: discovered.agencyDisplayName,
    alert: 'No delays reported on this route.',
    color: discovered.color,
    destination: direction1?.headsign ?? direction0?.headsign ?? discovered.routeName,
    direction: 'Toward',
    directions: [directionFor(direction1, direction0), directionFor(direction0, direction1)],
    id: `${discovered.agencyId}:${discovered.routeId}`,
    liveSource: {
      agencyId: discovered.agencyId,
      routeId: discovered.routeId,
      direction1StopId: direction1?.stopId ?? fallbackStopId,
      direction0StopId: direction0?.stopId ?? fallbackStopId,
      direction1Index: 0,
    },
    predictions: [],
    routeName: discovered.routeName,
    shortName: discovered.shortName,
  };
}
