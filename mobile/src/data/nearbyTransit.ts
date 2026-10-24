
import type { Coordinates } from '../hooks/useCurrentLocation';
import { callable } from '../lib/firebase';
import { whenWarm } from './backendWarmup';
import { preferredDirectionIndex, type LiveSource, type RouteDetail, type TransitDirection } from './transit';

type DiscoveredDirection = { stopId: string; name: string; headsign: string | null; distanceMeters?: number; stopsAhead?: number | null } | null;

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

const findNearbyTransitCallable = callable<{ lat: number; lon: number }, FindNearbyTransitResponse>('findNearbyTransit',
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
  await whenWarm('findNearbyTransit');
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
    // The destination alone ("Patchogue"), not "Toward Patchogue".
    direction: primary?.headsign ?? 'Schedule unavailable',
    live: false,
    minutes: 0,
    stopName: primary?.name ?? other?.name ?? 'Unknown stop',
    stopId: primary?.stopId,
    distanceMeters: primary?.distanceMeters,
    stopsAhead: primary?.stopsAhead ?? undefined,
    unavailable: true,
  });
  // Direction 1 comes first unless direction 0 is clearly the one to ride: on the Staten Island
  // Ferry's St. George side, or at the end of a line (see preferredDirectionIndex).
  const byDirectionId: [TransitDirection, TransitDirection] = [directionFor(direction1, direction0), directionFor(direction0, direction1)];
  const direction1Index = preferredDirectionIndex(byDirectionId) === 1 ? 1 : 0;
  const lead = direction1Index === 0 ? direction1 ?? direction0 : direction0;

  return {
    agency: discovered.agencyDisplayName,
    alert: 'No delays reported on this route.',
    color: discovered.color,
    destination: lead?.headsign ?? discovered.routeName,
    direction: lead?.headsign ?? discovered.routeName,
    directions: direction1Index === 0 ? byDirectionId : [byDirectionId[1], byDirectionId[0]],
    id: `${discovered.agencyId}:${discovered.routeId}`,
    liveSource: {
      agencyId: discovered.agencyId,
      routeId: discovered.routeId,
      direction1StopId: direction1?.stopId ?? fallbackStopId,
      direction0StopId: direction0?.stopId ?? fallbackStopId,
      direction1Index,
    },
    predictions: [],
    routeName: discovered.routeName,
    shortName: discovered.shortName,
  };
}

const searchTransitRoutesCallable = callable<{ query: string; lat: number; lon: number }, { routes: DiscoveredRoute[] }>('searchTransitRoutes');
const describeTransitRouteCallable = callable<{ agencyId: string; routeId: string; lat: number; lon: number }, { route: DiscoveredRoute }>('describeTransitRoute');

/** Lines whose name matches a search ("1", "B46", "Port Jefferson"), best match first, at their stops nearest `near`. */
export async function searchTransitRoutes(query: string, near: Coordinates): Promise<readonly DiscoveredRoute[]> {
  const { data } = await searchTransitRoutesCallable({ query, lat: near.latitude, lon: near.longitude });
  return data.routes;
}

/**
 * One line opened at a particular stop (a stop row or transfer badge in route view): its route
 * view stays on the stop nearest `at`, wherever the rider is. Its id carries the point, so the
 * same line at two stations is two route views (and two live entries), each with its own times.
 */
export async function fetchRouteAtStop(agencyId: LiveSource['agencyId'], routeId: string, at: Coordinates): Promise<RouteDetail> {
  const { data } = await describeTransitRouteCallable({ agencyId, routeId, lat: at.latitude, lon: at.longitude });
  return routeDetailAt(data.route, at);
}

/** `discoveredRouteToRouteDetail`, pinned to the stops nearest `at` rather than the rider. */
export function routeDetailAt(discovered: DiscoveredRoute, at: Coordinates): RouteDetail {
  const route = discoveredRouteToRouteDetail(discovered);
  return {
    ...route,
    id: `${route.id}@${at.latitude.toFixed(5)},${at.longitude.toFixed(5)}`,
    liveSource: { ...route.liveSource!, anchor: at },
  };
}
