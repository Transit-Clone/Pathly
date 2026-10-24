
import { callable } from '../lib/firebase';
import { whenWarm } from './backendWarmup';
import type { StationTransfer, TransferMode } from './stationTransfers';
import type { LiveSource } from './transit';

/** `offsetMinutes` is this stop's real scheduled time, relative to `stops[0]` — see gtfsDiscovery.ts's getRouteGeometry. */
export type GeometryStop = { stopId: string; name: string; lat: number; lon: number; offsetMinutes: number };
/** `path` is the agency's published track/street geometry (GTFS shapes); absent when it has none (or from an older backend), in which case the line joins the stops. */
export type RouteGeometry = { headsign: string; stops: readonly GeometryStop[]; path?: readonly { lat: number; lon: number }[] };

type RouteGeometryResponse = { headsign: string; stops: GeometryStop[]; path?: { lat: number; lon: number }[] };

const getRouteGeometryCallable = callable<{ agencyId: string; routeId: string; directionId: 0 | 1 }, RouteGeometryResponse>('getRouteGeometry',
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

  const promise = whenWarm('getRouteGeometry')
    .then(() => getRouteGeometryCallable({ agencyId: source.agencyId, routeId: source.routeId, directionId }))
    .then(({ data }) => data)
    .catch(() => null);
  cache.set(cacheKey, promise);
  return promise;
}

/** A line to change to at a stop, with the ids to open it in route view. */
export type LineTransfer = StationTransfer & { agencyId: LiveSource['agencyId']; routeId: string };

/** Mirrors firebase/functions/src/gtfsDiscovery.ts's StopTransfer. */
type StopTransfer = { agencyId: LiveSource['agencyId']; agencyDisplayName: string; routeId: string; shortName: string; color: string };

const getRouteTransfersCallable = callable<{ agencyId: string; routeId: string; directionId: 0 | 1 }, { transfers: Record<string, StopTransfer[]> }>('getRouteTransfers');
const transfersCache = new Map<string, Promise<Readonly<Record<string, readonly LineTransfer[]>>>>();

/** Forgets loaded transfers (tests that answer with their own). */
export function clearRouteTransfersCache(): void {
  transfersCache.clear();
}

function transferMode(agencyId: LiveSource['agencyId']): TransferMode {
  if (agencyId === 'subway') return 'subway';
  if (agencyId === 'lirr') return 'rail';
  if (agencyId === 'nycferry' || agencyId === 'siferry') return 'ferry';
  return 'bus';
}

/**
 * The other lines at each stop of a route's direction, keyed by stop id, from every agency's
 * real data. Empty (never an error) when it can't load, so the stop list simply has no badges.
 * Cached per route and direction for the app session.
 */
export function fetchRouteTransfers(source: LiveSource, directionId: 0 | 1): Promise<Readonly<Record<string, readonly LineTransfer[]>>> {
  const cacheKey = `${source.agencyId}:${source.routeId}:${directionId}`;
  const cached = transfersCache.get(cacheKey);
  if (cached) return cached;
  const promise = getRouteTransfersCallable({ agencyId: source.agencyId, routeId: source.routeId, directionId })
    .then(({ data }) => Object.fromEntries(Object.entries(data.transfers).map(([stopId, transfers]) => [stopId, transfers.map((transfer): LineTransfer => ({
      agency: transfer.agencyDisplayName,
      agencyId: transfer.agencyId,
      color: transfer.color,
      mode: transferMode(transfer.agencyId),
      name: transfer.shortName,
      routeId: transfer.routeId,
      textColor: null,
    }))])))
    .catch(() => ({}));
  transfersCache.set(cacheKey, promise);
  // Nothing found (or a failed request) is asked again next time rather than kept for the session.
  void promise.then((transfers) => {
    if (Object.keys(transfers).length === 0) transfersCache.delete(cacheKey);
  });
  return promise;
}
