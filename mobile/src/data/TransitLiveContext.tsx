import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { fetchNearestRouteStop, type NearestRouteStop } from './nearestRouteStop';
import { routes, type LiveSource, type RouteDetail } from './transit';
import { fetchRouteLiveData, type RouteLiveData } from './transitLive';

// Frequent enough that live vehicles visibly move; the feeds themselves update every few seconds.
const POLL_INTERVAL_MS = 15_000;
// A route that comes into view is fetched right away unless it was just fetched.
const REFETCH_ON_VIEW_AFTER_MS = 5_000;

const STATIC_LIVE_ROUTES = routes.filter((route) => route.liveSource);

export type RouteLiveStatus =
  | { status: 'loading' }
  // `nearestStop` is null when it couldn't be resolved (e.g. offline) — predictions still use
  // the route's static fallback stop ids in that case, so `data` is never blocked on it.
  | { status: 'loaded'; data: RouteLiveData; nearestStop: NearestRouteStop | null }
  | { status: 'error' };

const TransitLiveContext = createContext<ReadonlyMap<string, RouteLiveStatus>>(new Map());

/**
 * Live departures and vehicles for routes with a `liveSource` — the fixed demo catalog plus
 * whichever dynamically-discovered routes (`extraRoutes`, see nearbyTransit.ts) the caller
 * shows — and stays mounted across HomeScreen's view switches.
 *
 * Only `activeRouteIds` (the routes on screen: visible home cards, or the open route detail)
 * are requested, every POLL_INTERVAL_MS and again when the rider's location changes. A route
 * that becomes active is fetched immediately; one that stops being active keeps its last data
 * (so it shows at once when scrolled back into view) but is no longer refreshed. Omitting
 * `activeRouteIds` treats every route as active.
 *
 * Every live-enabled route starts at `loading` (not simply absent) so a consumer can tell "still
 * fetching" apart from "this route never had live data", and a route whose fetch has never once
 * succeeded reports `error`. A route that *has* loaded before keeps its last good value if a
 * later poll fails, rather than flashing to an error state over one transient network hiccup.
 */
export function TransitLiveProvider({
  activeRouteIds,
  children,
  extraRoutes = [],
  location,
}: {
  activeRouteIds?: readonly string[];
  children: ReactNode;
  extraRoutes?: readonly RouteDetail[];
  location: Coordinates;
}) {
  const [liveStatus, setLiveStatus] = useState<ReadonlyMap<string, RouteLiveStatus>>(new Map());

  // Keyed by route id so a route appearing in both — unlikely, but a discovered route could in
  // principle resolve to the same (agencyId, routeId) as a demo-catalog one — isn't fetched twice.
  const liveRoutesById = new Map<string, RouteDetail>();
  for (const route of STATIC_LIVE_ROUTES) liveRoutesById.set(route.id, route);
  for (const route of extraRoutes) if (route.liveSource) liveRoutesById.set(route.id, route);
  const liveRoutes = [...liveRoutesById.values()];
  const liveRouteIdsKey = liveRoutes.map((route) => route.id).sort().join(',');
  const activeRoutes = activeRouteIds ? liveRoutes.filter((route) => activeRouteIds.includes(route.id)) : liveRoutes;
  const activeRouteIdsKey = activeRoutes.map((route) => route.id).sort().join(',');

  // Routes not seen before (a newly-discovered nearby one, most likely) start at `loading`
  // immediately. Adjusted during render (same pattern as RouteDetailView's
  // predictionResetForDirection) rather than in an effect, since it's a direct response to the
  // route-id set changing, not a subscription to an external system.
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

  // The latest active routes and location, for the poll timer to read without restarting.
  const latest = useRef({ activeRoutes, location });
  useEffect(() => {
    latest.current = { activeRoutes, location };
  });
  const lastFetchedAt = useRef(new Map<string, number>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // One request per route: the backend resolves the rider's nearest stop and its departures
  // together. Each route's result is applied as soon as it arrives, so a card never waits on
  // another route's (possibly cold) request.
  const fetchRoutes = useCallback((routesToFetch: readonly RouteDetail[], at: Coordinates) => {
    const loadRoute = async (route: RouteDetail): Promise<RouteLiveStatus> => {
      const source = route.liveSource!;
      try {
        const data = await fetchRouteLiveData(source, at);
        if (data.nearestStop !== undefined) return { status: 'loaded', data, nearestStop: data.nearestStop };
        // Older backend without in-call nearest stops: resolve it separately, then refetch for it.
        const nearestStop = await fetchNearestRouteStop(source, at);
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

    for (const route of routesToFetch) {
      lastFetchedAt.current.set(route.id, Date.now());
      void loadRoute(route).then((result) => {
        if (!mounted.current) return;
        setLiveStatus((current) => {
          // A route that has loaded before keeps its last good value through one failed poll.
          if (result.status === 'error' && current.get(route.id)?.status === 'loaded') return current;
          const next = new Map(current);
          next.set(route.id, result);
          return next;
        });
      });
    }
  }, []);

  // Every active route, now (the rider's location changed) and then on the poll interval.
  useEffect(() => {
    fetchRoutes(latest.current.activeRoutes, latest.current.location);
    const interval = setInterval(() => fetchRoutes(latest.current.activeRoutes, latest.current.location), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // Keyed on the coordinate primitives, not the `location` object (new every GPS update).
  }, [location.latitude, location.longitude, fetchRoutes]);

  // Routes that just came into view, right away (unless just fetched) — routes that were already
  // in view keep their own poll timing.
  const previouslyActiveIds = useRef(new Set<string>());
  useEffect(() => {
    const now = Date.now();
    const { activeRoutes: active, location: at } = latest.current;
    const due = active.filter((route) => !previouslyActiveIds.current.has(route.id) && now - (lastFetchedAt.current.get(route.id) ?? 0) > REFETCH_ON_VIEW_AFTER_MS);
    previouslyActiveIds.current = new Set(active.map((route) => route.id));
    if (due.length > 0) fetchRoutes(due, at);
  }, [activeRouteIdsKey, fetchRoutes]);

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
