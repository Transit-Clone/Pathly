import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { fetchNearestRouteStop, type NearestRouteStop } from './nearestRouteStop';
import { routes, type LiveSource, type RouteId } from './transit';
import { fetchRouteLiveData, type RouteLiveData } from './transitLive';

const POLL_INTERVAL_MS = 30_000;

const LIVE_ROUTES = routes.filter((route) => route.liveSource);

export type RouteLiveStatus =
  | { status: 'loading' }
  // `nearestStop` is null when it couldn't be resolved (e.g. offline) — predictions still use
  // the route's static fallback stop ids in that case, so `data` is never blocked on it.
  | { status: 'loaded'; data: RouteLiveData; nearestStop: NearestRouteStop | null }
  | { status: 'error' };

const initialStatus = new Map<RouteId, RouteLiveStatus>(LIVE_ROUTES.map((route) => [route.id, { status: 'loading' }]));

const TransitLiveContext = createContext<ReadonlyMap<RouteId, RouteLiveStatus>>(initialStatus);

/**
 * Polls every route with a `liveSource` (LIRR and subway alike) in parallel; stays mounted
 * across HomeScreen's view switches. Every live-enabled route starts at `loading` (not simply
 * absent) so a consumer can tell "still fetching" apart from "this route never had live data",
 * and a route whose fetch has never once succeeded reports `error` rather than silently
 * leaving callers to fall back to static placeholder numbers. A route that *has* loaded before
 * just keeps its last good value if a later poll fails, rather than flashing to an error state
 * over one transient network hiccup.
 *
 * Each cycle first resolves whichever stop on that route is actually nearest to `location` —
 * not the route's hand-picked fallback station — and fetches live predictions for that stop
 * instead, so a route card follows the rider as they move. Re-runs whenever `location` changes
 * (the watch in useCurrentLocation already throttles how often that is), not just on the fixed
 * poll interval, so a real GPS fix landing after the initial load is picked up promptly.
 */
export function TransitLiveProvider({ children, location }: { children: ReactNode; location: Coordinates }) {
  const [liveStatus, setLiveStatus] = useState<ReadonlyMap<RouteId, RouteLiveStatus>>(initialStatus);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const results = await Promise.all(
        LIVE_ROUTES.map(async (route) => {
          try {
            const nearestStop = await fetchNearestRouteStop(route.liveSource!, location);
            const effectiveSource: LiveSource = nearestStop?.direction1StopId && nearestStop.direction0StopId
              ? { ...route.liveSource!, direction1StopId: nearestStop.direction1StopId, direction0StopId: nearestStop.direction0StopId }
              : route.liveSource!;
            const data = await fetchRouteLiveData(effectiveSource);
            return [route.id, { status: 'loaded', data, nearestStop } satisfies RouteLiveStatus] as const;
          } catch {
            return [route.id, { status: 'error' } satisfies RouteLiveStatus] as const;
          }
        }),
      );
      if (cancelled) return;
      setLiveStatus((current) => {
        const next = new Map(current);
        for (const [routeId, result] of results) {
          if (result.status === 'error' && current.get(routeId)?.status === 'loaded') continue;
          next.set(routeId, result);
        }
        return next;
      });
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the coordinate primitives, not the `location` object (a new reference every GPS update)
  }, [location.latitude, location.longitude]);

  return <TransitLiveContext.Provider value={liveStatus}>{children}</TransitLiveContext.Provider>;
}

/** `{ status: 'error' }` for a route with no `liveSource` at all (nothing is polling it), not just one that hasn't loaded yet. */
export function useTransitLive(routeId: RouteId): RouteLiveStatus {
  return useContext(TransitLiveContext).get(routeId) ?? { status: 'error' };
}

/** The full routeId -> live status map, for callers applying live data across several routes at once (e.g. a list of cards) rather than one at a time. */
export function useTransitLiveMap(): ReadonlyMap<RouteId, RouteLiveStatus> {
  return useContext(TransitLiveContext);
}
