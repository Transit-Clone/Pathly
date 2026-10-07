import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { fetchNearestRouteStop, type NearestRouteStop } from './nearestRouteStop';
import { routes, type LiveSource, type RouteDetail } from './transit';
import { fetchRouteLiveData, type RouteLiveData } from './transitLive';

// Frequent enough that live vehicles visibly move; the feeds themselves update every few seconds.
const POLL_INTERVAL_MS = 15_000;

const STATIC_LIVE_ROUTES = routes.filter((route) => route.liveSource);

export type RouteLiveStatus =
  | { status: 'loading' }
  // `nearestStop` is null when it couldn't be resolved (e.g. offline) — predictions still use
  // the route's static fallback stop ids in that case, so `data` is never blocked on it.
  | { status: 'loaded'; data: RouteLiveData; nearestStop: NearestRouteStop | null }
  | { status: 'error' };

const TransitLiveContext = createContext<ReadonlyMap<string, RouteLiveStatus>>(new Map());

/**
 * Polls every route with a `liveSource` in parallel — the fixed demo catalog (LIRR Port
 * Jefferson Branch, subway E/7, Suffolk County Transit S1/51, NICE Bus N4) plus whichever
 * dynamically-discovered nearby routes (`extraRoutes`, see nearbyTransit.ts) the caller is
 * currently showing — and stays mounted across HomeScreen's view switches. Every live-enabled
 * route starts at `loading` (not simply absent) so a consumer can tell "still fetching" apart
 * from "this route never had live data", and a route whose fetch has never once succeeded
 * reports `error` rather than silently leaving callers to fall back to static placeholder
 * numbers. A route that *has* loaded before just keeps its last good value if a later poll
 * fails, rather than flashing to an error state over one transient network hiccup.
 *
 * Each cycle first resolves whichever stop on that route is actually nearest to `location` —
 * not the route's hand-picked fallback station — and fetches live predictions for that stop
 * instead, so a route card follows the rider as they move. Re-runs whenever `location` or
 * `extraRoutes` changes (the watch in useCurrentLocation already throttles how often location
 * does), not just on the fixed poll interval, so a real GPS fix or a newly-discovered nearby
 * route is picked up promptly.
 */
export function TransitLiveProvider({ children, extraRoutes = [], location }: { children: ReactNode; extraRoutes?: readonly RouteDetail[]; location: Coordinates }) {
  const [liveStatus, setLiveStatus] = useState<ReadonlyMap<string, RouteLiveStatus>>(new Map());

  // Keyed by route id so a route appearing in both — unlikely, but a discovered route could in
  // principle resolve to the same (agencyId, routeId) as a demo-catalog one — doesn't get
  // polled twice.
  const liveRoutesById = new Map<string, RouteDetail>();
  for (const route of STATIC_LIVE_ROUTES) liveRoutesById.set(route.id, route);
  for (const route of extraRoutes) if (route.liveSource) liveRoutesById.set(route.id, route);
  const liveRoutes = [...liveRoutesById.values()];
  const liveRouteIdsKey = liveRoutes.map((route) => route.id).sort().join(',');

  // Routes not seen before (a newly-discovered nearby one, most likely) start at `loading`
  // immediately rather than waiting for the first `load()` pass below to even begin. Adjusted
  // during render (same pattern as RouteDetailView's predictionResetForDirection) rather than
  // in an effect, since it's a direct response to the route-id set changing, not a
  // subscription to an external system.
  const [seededRouteIdsKey, setSeededRouteIdsKey] = useState<string | null>(null);
  if (liveRouteIdsKey !== seededRouteIdsKey) {
    setSeededRouteIdsKey(liveRouteIdsKey);
    setLiveStatus((current) => {
      let changed = false;
      const next = new Map(current);
      for (const route of liveRoutes) {
        if (!next.has(route.id)) {
          next.set(route.id, { status: 'loading' });
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  useEffect(() => {
    let cancelled = false;

    // One request per route: the backend resolves the rider's nearest stop and its departures
    // together. Each route's result is applied as soon as it arrives, so a card never waits on
    // another route's (possibly cold) request.
    const loadRoute = async (route: RouteDetail): Promise<RouteLiveStatus> => {
      const source = route.liveSource!;
      try {
        const data = await fetchRouteLiveData(source, location);
        if (data.nearestStop !== undefined) return { status: 'loaded', data, nearestStop: data.nearestStop };
        // Older backend without in-call nearest stops: resolve it separately, then refetch for it.
        const nearestStop = await fetchNearestRouteStop(source, location);
        // Each direction overrides independently — they're never assumed to share a station.
        const effectiveSource: LiveSource = {
          ...source,
          direction1StopId: nearestStop?.direction1?.stopId ?? source.direction1StopId,
          direction0StopId: nearestStop?.direction0?.stopId ?? source.direction0StopId,
        };
        const sameStops = effectiveSource.direction1StopId === source.direction1StopId && effectiveSource.direction0StopId === source.direction0StopId;
        return { status: 'loaded', data: sameStops ? data : await fetchRouteLiveData(effectiveSource), nearestStop };
      } catch {
        return { status: 'error' };
      }
    };

    const load = () => {
      for (const route of liveRoutes) {
        void loadRoute(route).then((result) => {
          if (cancelled) return;
          setLiveStatus((current) => {
            // A route that has loaded before keeps its last good value through one failed poll.
            if (result.status === 'error' && current.get(route.id)?.status === 'loaded') return current;
            const next = new Map(current);
            next.set(route.id, result);
            return next;
          });
        });
      }
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the coordinate primitives and the route-id set, not the `location`/`liveRoutes` objects (new references every GPS update / render)
  }, [location.latitude, location.longitude, liveRouteIdsKey]);

  return <TransitLiveContext.Provider value={liveStatus}>{children}</TransitLiveContext.Provider>;
}

/** `{ status: 'error' }` for a route with no `liveSource` at all (nothing is polling it), not just one that hasn't loaded yet. */
export function useTransitLive(routeId: string): RouteLiveStatus {
  return useContext(TransitLiveContext).get(routeId) ?? { status: 'error' };
}

/** The full routeId -> live status map, for callers applying live data across several routes at once (e.g. a list of cards) rather than one at a time. */
export function useTransitLiveMap(): ReadonlyMap<string, RouteLiveStatus> {
  return useContext(TransitLiveContext);
}
