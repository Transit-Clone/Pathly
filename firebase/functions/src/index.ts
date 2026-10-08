import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { enforceCallableSecurity, type CallableRateLimit } from './callableSecurity';
import { findNearbyTransit as findNearbyTransitDiscovery, getNearestStopForRoute, getRouteGeometry as getRouteGeometryDiscovery } from './gtfsDiscovery';
import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { getStopPredictions } from './gtfsSchedule';
import { refreshAllGtfsSnapshots } from './gtfsSnapshots';
import { loadAgencyStaticData, prepareAgencyStaticData } from './gtfsStaticData';
import { getRouteStatus } from './gtfsStatus';

const CALLABLE_RUNTIME_SERVICE_ACCOUNT = 'pathly-callable-runtime@pathly-b7f0f.iam.gserviceaccount.com';
const GTFS_WRITER_SERVICE_ACCOUNT = 'pathly-gtfs-writer@pathly-b7f0f.iam.gserviceaccount.com';

/** Set once with: firebase functions:secrets:set GOOGLE_MAPS_API_KEY */
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
/** Set once with: firebase functions:secrets:set SWIFTLY_API_KEY. Needed for NICE Bus/Suffolk County Transit's real-time feeds (hosted by Swiftly, a third-party provider); not used by LIRR or subway. */
const swiftlyApiKey = defineSecret('SWIFTLY_API_KEY');

// Keep false until web and native releases are producing valid App Check tokens. This is
// version-controlled deliberately so a deploy from a machine missing local config cannot
// silently change enforcement.
const enforceTransitAppCheck = false;
// Static GTFS roots and indexes switch together at request boundaries. One request per transit
// instance prevents an in-flight request from observing a mixture of two daily snapshots.
const protectedCallableOptions = {
  concurrency: 1,
  enforceAppCheck: enforceTransitAppCheck,
  maxInstances: 10,
  memory: '1GiB',
  serviceAccount: CALLABLE_RUNTIME_SERVICE_ACCOUNT,
} as const;
// Swiftly's NICE/Suffolk feeds have a shared provider quota. Keeping live status on one instance
// makes the short in-process feed cache coalesce every route poll into one upstream request per
// feed, while the CPU-heavy static-data endpoints can still scale horizontally.
const liveStatusCallableOptions = { ...protectedCallableOptions, maxInstances: 1 } as const;
const RATE_LIMITS = {
  // Live/nearest calls run per visible route every 30 seconds and after meaningful GPS updates.
  getRouteLiveStatus: { userPerMinute: 600 },
  // One batch per refresh of the cards on screen (every 15 s, plus on scrolling and moving).
  getRoutesLiveStatus: { userPerMinute: 120 },
  // Opened on demand from route detail's "More departures" card.
  getStopDepartures: { userPerMinute: 60 },
  findNearbyTransit: { userPerMinute: 30 },
  getNearestRouteStop: { userPerMinute: 600 },
  getRouteGeometry: { userPerMinute: 120 },
  geocodeAddress: { userPerMinute: 10 },
} satisfies Record<string, CallableRateLimit>;

/** Refresh official static feeds daily; each agency publishes atomically and retries safely. */
export const refreshGtfsStaticData = onSchedule(
  {
    concurrency: 1,
    maxBackoffSeconds: 300,
    maxInstances: 1,
    memory: '1GiB',
    minBackoffSeconds: 60,
    retryCount: 3,
    schedule: '0 4 * * *',
    serviceAccount: GTFS_WRITER_SERVICE_ACCOUNT,
    timeZone: 'America/New_York',
    timeoutSeconds: 540,
  },
  refreshAllGtfsSnapshots,
);

function requiredString(value: unknown, name: string, maxLength = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpsError('invalid-argument', `${name} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function requiredAgencyId(value: unknown): AgencyId {
  const agencyId = requiredString(value, 'agencyId', 32);
  if (!Object.hasOwn(AGENCY_CONFIGS, agencyId)) throw new HttpsError('invalid-argument', 'agencyId is not supported');
  return agencyId as AgencyId;
}

function requiredRouteId(agencyId: AgencyId, value: unknown): string {
  const routeId = requiredString(value, 'routeId');
  if (!loadAgencyStaticData(agencyId).routesById.has(routeId)) {
    throw new HttpsError('invalid-argument', `routeId is not supported for agencyId "${agencyId}"`);
  }
  return routeId;
}

function requiredCoordinates(lat: unknown, lon: unknown): { lat: number; lon: number } {
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new HttpsError('invalid-argument', 'lat and lon must be valid coordinates');
  }
  return { lat, lon };
}

/** `lat`/`lon` (optional): resolve the nearest stop per direction server-side and use it instead of the given stop ids. */
type RouteLiveStatusRequest = { agencyId: AgencyId; routeId: string; direction1StopId: string; direction0StopId: string; lat?: number; lon?: number };

/**
 * Live trip updates and vehicle positions for one route on any configured agency (gtfsAgencies.ts),
 * plus departure predictions at a station — padded with the real published timetable when live
 * has nothing upcoming, for agencies where that's reliable (see getStopPredictions). One
 * callable for every agency rather than one per agency; see routes.txt/stops.txt under each
 * agency's static_data directory for valid IDs. LIRR and subway need no API key; NICE
 * Bus/Suffolk County Transit's Swiftly-hosted feeds do — declaring the secret here makes it
 * available as `process.env.SWIFTLY_API_KEY` wherever this call ends up (gtfsAgencies.ts),
 * without every other callable needing to know about it.
 * Client call: httpsCallable(functions, 'getRouteLiveStatus')({ agencyId, routeId, direction1StopId, direction0StopId }).
 * (For agencies where one stop_id serves a station regardless of direction, pass the same id
 * for both direction1StopId and direction0StopId.)
 */
export const getRouteLiveStatus = onCall<RouteLiveStatusRequest>({ ...liveStatusCallableOptions, secrets: [swiftlyApiKey] }, async (request) => {
  await enforceCallableSecurity(request, 'getRouteLiveStatus', RATE_LIMITS.getRouteLiveStatus);
  const data = request.data ?? ({} as RouteLiveStatusRequest);
  await prepareAgencyStaticData(requiredAgencyId(data.agencyId));
  return routeLiveStatus(data);
});

/** One route's live status — the shared body of getRouteLiveStatus and getRoutesLiveStatus. Its agency's static data must already be prepared. */
async function routeLiveStatus(data: RouteLiveStatusRequest) {
  const agencyId = requiredAgencyId(data.agencyId);
  const routeId = requiredRouteId(agencyId, data.routeId);
  let direction1StopId = requiredString(data.direction1StopId, 'direction1StopId');
  let direction0StopId = requiredString(data.direction0StopId, 'direction0StopId');
  // Location is optional, but when either coordinate is sent both must be valid.
  const location = data.lat !== undefined || data.lon !== undefined ? requiredCoordinates(data.lat, data.lon) : null;

  // With the rider's location, the nearest stop is resolved here (in parallel with the live
  // feed) rather than by a separate prior call, so a route needs one round trip, not two. Each
  // direction falls back to the given stop id if it can't be resolved.
  const hasLocation = location !== null;
  const [status, nearestStop] = await Promise.all([
    getRouteStatus(agencyId, routeId),
    location ? getNearestStopForRoute(agencyId, routeId, location.lat, location.lon).catch(() => null) : Promise.resolve(null),
  ]);
  direction1StopId = nearestStop?.direction1?.stopId ?? direction1StopId;
  direction0StopId = nearestStop?.direction0?.stopId ?? direction0StopId;
  const stopPredictions = await getStopPredictions(agencyId, routeId, direction1StopId, direction0StopId, status.trips);
  return { ...status, stopPredictions, ...(hasLocation ? { nearestStop } : {}) };
}

/** The most routes one batch may ask for (a screenful of cards with room to spare). */
const MAX_BATCH_ROUTES = 12;
type RoutesLiveStatusRequest = { routes: Omit<RouteLiveStatusRequest, 'lat' | 'lon'>[]; lat?: number; lon?: number };

/**
 * Live status for several routes in one request — every card on screen at once. Live status runs
 * on one instance, one request at a time (see liveStatusCallableOptions), so one batch instead of
 * a request per card means the screen waits in that queue once, not once per card. Each route
 * succeeds or fails on its own: `results[i]` is `{ ok: true, data }` (getRouteLiveStatus's
 * response) or `{ ok: false, code }`.
 * Client call: httpsCallable(functions, 'getRoutesLiveStatus')({ routes: [{ agencyId, routeId, direction1StopId, direction0StopId }, ...], lat, lon }).
 */
export const getRoutesLiveStatus = onCall<RoutesLiveStatusRequest>({ ...liveStatusCallableOptions, secrets: [swiftlyApiKey] }, async (request) => {
  await enforceCallableSecurity(request, 'getRoutesLiveStatus', RATE_LIMITS.getRoutesLiveStatus);
  const data = request.data ?? ({} as RoutesLiveStatusRequest);
  if (!Array.isArray(data.routes) || data.routes.length === 0 || data.routes.length > MAX_BATCH_ROUTES) {
    throw new HttpsError('invalid-argument', `routes must list 1 to ${MAX_BATCH_ROUTES} routes`);
  }
  const location = data.lat !== undefined || data.lon !== undefined ? requiredCoordinates(data.lat, data.lon) : null;

  // Each agency's static snapshot is prepared once, one after another (preparing can switch the
  // active snapshot, which must not happen while another route is reading it); then every route
  // is answered in parallel.
  const agencies = new Set<AgencyId>();
  for (const route of data.routes) {
    if (typeof route?.agencyId === 'string' && Object.hasOwn(AGENCY_CONFIGS, route.agencyId)) agencies.add(route.agencyId as AgencyId);
  }
  for (const agencyId of agencies) await prepareAgencyStaticData(agencyId);

  const results = await Promise.all(data.routes.map(async (route) => {
    try {
      return { ok: true as const, data: await routeLiveStatus({ ...route, ...(location ? { lat: location.lat, lon: location.lon } : {}) }) };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false as const, code: error.code };
      logger.error('Batched route live status failed', { agencyId: route?.agencyId, routeId: route?.routeId, reason: error instanceof Error ? error.message : String(error) });
      return { ok: false as const, code: 'internal' };
    }
  }));
  return { results };
});

type StopDeparturesRequest = { agencyId: AgencyId; routeId: string; direction1StopId: string; direction0StopId: string; directionId: 0 | 1 };

/** Enough for any route's remaining day at one stop (the busiest subway stops run well under this). */
const FULL_DEPARTURES_LIMIT = 200;

/**
 * Every remaining departure today from one stop in one direction (plus the next service day's
 * first departures when fewer than six remain), merged live and scheduled exactly like
 * getRouteLiveStatus's tiles — for route detail's "More departures" page.
 * Client call: httpsCallable(functions, 'getStopDepartures')({ agencyId, routeId, direction1StopId, direction0StopId, directionId }).
 */
// Reads the same live feeds as getRouteLiveStatus, so it shares that instance's feed cache and quota.
export const getStopDepartures = onCall<StopDeparturesRequest>({ ...liveStatusCallableOptions, secrets: [swiftlyApiKey] }, async (request) => {
  await enforceCallableSecurity(request, 'getStopDepartures', RATE_LIMITS.getStopDepartures);
  const data = request.data ?? ({} as StopDeparturesRequest);
  const agencyId = requiredAgencyId(data.agencyId);
  await prepareAgencyStaticData(agencyId);
  const routeId = requiredRouteId(agencyId, data.routeId);
  const direction1StopId = requiredString(data.direction1StopId, 'direction1StopId');
  const direction0StopId = requiredString(data.direction0StopId, 'direction0StopId');
  const { directionId } = data;
  if (directionId !== 0 && directionId !== 1) throw new HttpsError('invalid-argument', 'directionId must be 0 or 1');

  const status = await getRouteStatus(agencyId, routeId);
  const predictions = await getStopPredictions(agencyId, routeId, direction1StopId, direction0StopId, status.trips, FULL_DEPARTURES_LIMIT);
  return { departures: directionId === 1 ? predictions.towardDirection1 : predictions.towardDirection0 };
});

type FindNearbyTransitRequest = { lat: number; lon: number };

/**
 * Every real route, on every configured agency, near a point — not limited to the handful of
 * routes this app has hand-built UI for. Each result already carries its own nearest stop and
 * both directions' real headsigns/stop_ids, ready to pass straight into getRouteLiveStatus for
 * live predictions, or getRouteGeometry for a real map.
 * Client call: httpsCallable(functions, 'findNearbyTransit')({ lat, lon }).
 */
export const findNearbyTransit = onCall<FindNearbyTransitRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'findNearbyTransit', RATE_LIMITS.findNearbyTransit);
  const { lat, lon } = requiredCoordinates(request.data?.lat, request.data?.lon);
  // Hydrate sequentially so a cold instance never buffers four bounded ZIPs at once.
  for (const agencyId of Object.keys(AGENCY_CONFIGS) as AgencyId[]) {
    await prepareAgencyStaticData(agencyId);
  }
  const routes = await findNearbyTransitDiscovery(lat, lon);
  return { routes };
});

type NearestRouteStopRequest = { agencyId: AgencyId; routeId: string; lat: number; lon: number };

/**
 * The nearest stop *on this specific route* to a point — not just the nearest station
 * system-wide. Lets a route card follow the rider's real location instead of anchoring to one
 * fixed station, for any route with a `liveSource`, not just the handful this app hand-picked
 * stations for originally.
 * Client call: httpsCallable(functions, 'getNearestRouteStop')({ agencyId, routeId, lat, lon }).
 */
export const getNearestRouteStop = onCall<NearestRouteStopRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'getNearestRouteStop', RATE_LIMITS.getNearestRouteStop);
  const data = request.data ?? ({} as NearestRouteStopRequest);
  const agencyId = requiredAgencyId(data.agencyId);
  await prepareAgencyStaticData(agencyId);
  const routeId = requiredRouteId(agencyId, data.routeId);
  const { lat, lon } = requiredCoordinates(data.lat, data.lon);

  const stop = await getNearestStopForRoute(agencyId, routeId, lat, lon);
  if (!stop) throw new HttpsError('not-found', `No stops found for ${agencyId} route "${routeId}"`);
  return stop;
});

type RouteGeometryRequest = { agencyId: AgencyId; routeId: string; directionId: 0 | 1 };

/**
 * A representative real station sequence for any route's direction on any configured agency,
 * derived generically from its longest scheduled trip — not limited to routes with hand-built
 * geometry. See gtfsDiscovery.ts for the "longest trip" caveat on branches that split partway
 * (e.g. LIRR's Port Jefferson Branch at Huntington).
 * Client call: httpsCallable(functions, 'getRouteGeometry')({ agencyId, routeId, directionId }).
 */
export const getRouteGeometry = onCall<RouteGeometryRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'getRouteGeometry', RATE_LIMITS.getRouteGeometry);
  const data = request.data ?? ({} as RouteGeometryRequest);
  const agencyId = requiredAgencyId(data.agencyId);
  await prepareAgencyStaticData(agencyId);
  const routeId = requiredRouteId(agencyId, data.routeId);
  const { directionId } = data;
  if (directionId !== 0 && directionId !== 1) throw new HttpsError('invalid-argument', 'directionId must be 0 or 1');

  const geometry = await getRouteGeometryDiscovery(agencyId, routeId, directionId);
  if (!geometry) throw new HttpsError('not-found', `No scheduled trips found for ${agencyId} route "${routeId}" direction ${directionId}`);
  return geometry;
});

type GeocodeRequest = { address: string };
type GeocodeResult = { lat: number; lng: number; formattedAddress: string };
type GeocodingApiResponse = {
  status: string;
  results: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
};

/**
 * Proxies the Geocoding API so the Maps Platform key never ships in the app bundle.
 * Client call: httpsCallable(functions, 'geocodeAddress')({ address }).
 */
export const geocodeAddress = onCall<GeocodeRequest, Promise<GeocodeResult>>(
  // No current client calls this billable proxy, so it is safe to require App Check now.
  {
    enforceAppCheck: true,
    maxInstances: 1,
    secrets: [googleMapsApiKey],
    serviceAccount: CALLABLE_RUNTIME_SERVICE_ACCOUNT,
  },
  async (request) => {
    await enforceCallableSecurity(request, 'geocodeAddress', RATE_LIMITS.geocodeAddress);
    const address = requiredString(request.data?.address, 'address', 200);

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', googleMapsApiKey.value());

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json()) as GeocodingApiResponse;

    if (body.status !== 'OK' || !body.results[0]) {
      throw new HttpsError('not-found', `No geocoding result for "${address}" (${body.status})`);
    }

    const [result] = body.results;
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  },
);
