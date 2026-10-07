import { httpsCallable } from 'firebase/functions';

import { functions } from '../lib/firebase';
import type { LiveSource } from './transit';

/** `offsetMinutes` is this stop's real scheduled time, relative to `stops[0]` — see gtfsDiscovery.ts's getRouteGeometry. */
export type GeometryStop = { stopId: string; name: string; lat: number; lon: number; offsetMinutes: number };
/** `path` is the agency's published track/street geometry (GTFS shapes); absent when it has none (or from an older backend), in which case the line joins the stops. */
export type RouteGeometry = { headsign: string; stops: readonly GeometryStop[]; path?: readonly { lat: number; lon: number }[] };

type RouteGeometryResponse = { headsign: string; stops: GeometryStop[]; path?: { lat: number; lon: number }[] };

const getRouteGeometryCallable = httpsCallable<{ agencyId: string; routeId: string; directionId: 0 | 1 }, RouteGeometryResponse>(
  functions,
  'getRouteGeometry',
);

const cache = new Map<string, Promise<RouteGeometry | null>>();

/**
 * The real station sequence for a route's direction — derived generically on the backend from
 * its actual scheduled trips (gtfsDiscovery.ts), not hand-authored per route. Works for any
 * route with a `liveSource`, not a fixed handful. Cached per route+direction for the app
 * session, since it's static enough not to need re-fetching every time a route is opened.
 */
export function fetchRouteGeometry(source: LiveSource, directionId: 0 | 1): Promise<RouteGeometry | null> {
  const cacheKey = `${source.agencyId}:${source.routeId}:${directionId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = getRouteGeometryCallable({ agencyId: source.agencyId, routeId: source.routeId, directionId })
    .then(({ data }) => data)
    .catch(() => null);
  cache.set(cacheKey, promise);
  return promise;
}
