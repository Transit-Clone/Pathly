import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { LIVE_CACHE_KEY, readCache, writeCache } from './deviceCache';
import { fetchNearestRouteStop, type NearestRouteStop } from './nearestRouteStop';
import { routes, type LiveSource, type RouteDetail } from './transit';
import { BatchUnavailableError, fetchRouteLiveData, fetchRoutesLiveData, MAX_BATCH_ROUTES, type RouteLiveData } from './transitLive';

// Frequent enough that live vehicles visibly move; the feeds themselves update every few seconds.
const POLL_INTERVAL_MS = 15_000;
// A route that comes into view is fetched right away unless it was just fetched.
const REFETCH_ON_VIEW_AFTER_MS = 5_000;
// Live times saved on the device are shown on reopening only while still this fresh; countdowns
// are aged from their fetch time, so a few minutes old still reads correctly.
const LIVE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const LIVE_CACHE_MAX_ROUTES = 40;
const LIVE_CACHE_WRITE_DELAY_MS = 2_000;

type CachedLiveStatus = { data: RouteLiveData; nearestStop: NearestRouteStop | null };

const STATIC_LIVE_ROUTES = routes.filter((route) => route.liveSource);

export type RouteLiveStatus =
  | { status: 'loading' }
  // `nearestStop` is null when it couldn't be resolved (e.g. offline) — predictions still use
  // the route's static fallback stop ids in that case, so `data` is never blocked on it.
  | { status: 'loaded'; data: RouteLiveData; nearestStop: NearestRouteStop | null }
  | { status: 'error' };

const TransitLiveContext = createContext<ReadonlyMap<string, RouteLiveStatus>>(new Map());

/**
 * One route on its own (the fallback when the backend can't batch). The backend resolves the
 * nearest stop in the same call; a backend older still gets a separate nearest-stop lookup.
 */
async function loadRoute(route: RouteDetail, at: Coordinates): Promise<RouteLiveStatus> {
  const source = route.liveSource!;
  try {
    const data = await fetchRouteLiveData(source, at);
    if (data.nearestStop !== undefined) return { status: 'loaded', data, nearestStop: data.nearestStop };
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
}

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

  // Reopening the app: the last live times saved on this device show at once for any route still
  // loading (never over fresher data), without their old vehicle positions.
  useEffect(() => {
    void readCache<Record<string, CachedLiveStatus>>(LIVE_CACHE_KEY, LIVE_CACHE_MAX_AGE_MS).then((cached) => {
      if (!cached || !mounted.current) return;
      setLiveStatus((current) => {
        const next = new Map(current);
        for (const [routeId, entry] of Object.entries(cached)) {
          if (Date.now() - entry.data.fetchedAt > LIVE_CACHE_MAX_AGE_MS) continue;
          const existing = next.get(routeId);
          if (existing && existing.status !== 'loading') continue;
          next.set(routeId, { status: 'loaded', data: { ...entry.data, vehicles: [] }, nearestStop: entry.nearestStop });
        }
        return next;
      });
    });
  }, []);
  // Saves the most recently fetched routes, a moment after changes settle.
  useEffect(() => {
    const timer = setTimeout(() => {
      const loaded = [...liveStatus].flatMap(([routeId, status]) => (status.status === 'loaded' ? [[routeId, status] as const] : []));
      loaded.sort(([, a], [, b]) => b.data.fetchedAt - a.data.fetchedAt);
      const entries = loaded.slice(0, LIVE_CACHE_MAX_ROUTES).map(([routeId, status]): [string, CachedLiveStatus] => [routeId, { data: status.data, nearestStop: status.nearestStop }]);
      if (entries.length > 0) void writeCache(LIVE_CACHE_KEY, Object.fromEntries(entries));
    }, LIVE_CACHE_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [liveStatus]);

  // Once the deployed backend turns out to predate batching, stop asking for batches.
  const batchUnavailable = useRef(false);

  // The routes on screen go out in one batch per agency (chunks of MAX_BATCH_ROUTES): the backend
  // answers live status one request at a time, so a batch waits in that queue once instead of once
  // per card, while a slow agency feed (e.g. Swiftly for NICE/Suffolk) can't hold up another
  // agency's cards. The backend resolves each route's nearest stop in the same call. Without
  // batching (an older backend), each route gets its own request instead.
  const fetchRoutes = useCallback((routesToFetch: readonly RouteDetail[], at: Coordinates) => {
    const apply = (route: RouteDetail, result: RouteLiveStatus) => {
      if (!mounted.current) return;
      setLiveStatus((current) => {
        // A route that has loaded before keeps its last good value through one failed poll.
        if (result.status === 'error' && current.get(route.id)?.status === 'loaded') return current;
        const next = new Map(current);
        next.set(route.id, result);
        return next;
      });
    };
    const fetchEach = (routes: readonly RouteDetail[]) => {
      for (const route of routes) void loadRoute(route, at).then((result) => apply(route, result));
    };

    for (const route of routesToFetch) lastFetchedAt.current.set(route.id, Date.now());
    if (batchUnavailable.current) {
      fetchEach(routesToFetch);
      return;
    }
    const byAgency = new Map<string, RouteDetail[]>();
    for (const route of routesToFetch) {
      const agencyRoutes = byAgency.get(route.liveSource!.agencyId);
      if (agencyRoutes) agencyRoutes.push(route);
      else byAgency.set(route.liveSource!.agencyId, [route]);
    }
    const chunks = [...byAgency.values()].flatMap((agencyRoutes) => Array.from(
      { length: Math.ceil(agencyRoutes.length / MAX_BATCH_ROUTES) },
      (_, index) => agencyRoutes.slice(index * MAX_BATCH_ROUTES, (index + 1) * MAX_BATCH_ROUTES),
    ));
    for (const chunk of chunks) {
      void fetchRoutesLiveData(chunk.map((route) => route.liveSource!), at).then(
        (results) => chunk.forEach((route, index) => {
          const data = results[index];
          if (!data) apply(route, { status: 'error' });
          // A backend answering without in-call nearest stops: that route takes the per-route path.
          else if (data.nearestStop === undefined) void loadRoute(route, at).then((result) => apply(route, result));
          else apply(route, { status: 'loaded', data, nearestStop: data.nearestStop });
        }),
        (error: unknown) => {
          if (error instanceof BatchUnavailableError) {
            batchUnavailable.current = true;
            fetchEach(chunk);
            return;
          }
          for (const route of chunk) apply(route, { status: 'error' });
        },
      );
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
