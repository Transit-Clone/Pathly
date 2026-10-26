import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { getAccessibleStops as findAccessibleStops } from './accessibleStops';
import { requireAdmin } from './admin';
import { collectBackendStatus } from './backendStatus';
import { enforceCallableSecurity, peekRateLimits, type CallableRateLimit } from './callableSecurity';
import {
  describeRoute,
  listLines,
  findNearbyTransit as findNearbyTransitDiscovery,
  getAgencyLines as getAgencyLinesDiscovery,
  getNearestStopForRoute,
  getRouteGeometry as getRouteGeometryDiscovery,
  getRouteTransfers as getRouteTransfersDiscovery,
  getWalkingPathToStop,
  searchRoutes,
  type StopTransfer,
} from './gtfsDiscovery';
import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { getStopPredictions } from './gtfsSchedule';
import { refreshAllGtfsSnapshots } from './gtfsSnapshots';
import { isAgencyAvailable, loadAgencyStaticData, loadGlobalStopRouteIndex, prepareAgencyStaticData } from './gtfsStaticData';
import { getRouteAlerts } from './gtfsAlerts';
import { sendSavedRouteAlerts } from './routeAlerts';
import { getRouteStatus } from './gtfsStatus';
import { isInServiceArea } from './serviceArea';
import { lookupStations, searchStops, type StationLookup } from './stopSearch';
import { agencyIdsForStep } from './tripAgencies';
import { createFareEstimator } from './tripFares';
import {
  buildRoutesRequest,
  normalizeRoutesResponse,
  ROUTES_API_URL,
  ROUTES_FIELD_MASK,
  type Itinerary,
  type PlanTripRequest,
  type RoutesResponse,
  type TripEndpoint,
  type TravelModeOption,
  type TripPreference,
} from './tripPlanning';
import { addTripStops, matchTripStops } from './tripStops';

const CALLABLE_RUNTIME_SERVICE_ACCOUNT = 'pathly-callable-runtime@pathly-b7f0f.iam.gserviceaccount.com';
const GTFS_WRITER_SERVICE_ACCOUNT = 'pathly-gtfs-writer@pathly-b7f0f.iam.gserviceaccount.com';

/** Set once with: firebase functions:secrets:set GOOGLE_MAPS_API_KEY */
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
/** Set once with: firebase functions:secrets:set SWIFTLY_API_KEY. Needed for NICE Bus/Suffolk County Transit's real-time feeds (hosted by Swiftly, a third-party provider); not used by LIRR or subway. */
const swiftlyApiKey = defineSecret('SWIFTLY_API_KEY');
/** Set once with: firebase functions:secrets:set MTA_BUS_TIME_API_KEY. MTA Bus Time's live feed for every NYC city bus. */
const mtaBusTimeApiKey = defineSecret('MTA_BUS_TIME_API_KEY');

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
  // Route detail asks again only when its stop changes or the rider moves.
  getWalkingPath: { userPerMinute: 60 },
  getRouteGeometry: { userPerMinute: 120 },
  // The home map's line layers: one call per agency switched on.
  getAgencyLines: { userPerMinute: 30 },
  getAccessibleStops: { userPerMinute: 30 },
  // Each plan is one billed Routes API request (Compute Routes Essentials).
  planTrip: { userPerMinute: 20 },
  geocodeAddress: { userPerMinute: 10 },
  // "Choose on map" names the pin once the map comes to rest.
  reverseGeocode: { userPerMinute: 30 },
  // About one call per pause in typing, alongside Google's suggestions.
  searchTransitStops: { userPerMinute: 60 },
  searchTransitRoutes: { userPerMinute: 60 },
  // The app's line index: fetched once a day or so per device.
  listTransitLines: { userPerMinute: 10 },
  // Opening a line from a stop or transfer badge in route view.
  describeTransitRoute: { userPerMinute: 60 },
  // Admin-only; each call checks every live feed.
  getBackendStatus: { userPerMinute: 6 },
} satisfies Record<string, CallableRateLimit>;

// City bus timetables load from Cloud Storage on first use, which the budget leaves room for.
const TRIP_STOPS_BUDGET_MS = 3_000;
let tripStopMatcher = matchTripStops;
/** Unit-test dependency injection only. */
export function setTripStopMatcherForTests(matcher: typeof matchTripStops | undefined): void {
  tripStopMatcher = matcher ?? matchTripStops;
}

/** Refresh official static feeds daily; each agency publishes atomically and retries safely. */
export const refreshGtfsStaticData = onSchedule(
  {
    concurrency: 1,
    maxBackoffSeconds: 300,
    maxInstances: 1,
    // City bus feeds (Brooklyn: 164 MB unpacked, 2.4M stop times) are staged and prepared in /tmp,
    // which is held in memory, and their route files uploaded one by one: room for both, once a day.
    memory: '4GiB',
    minBackoffSeconds: 60,
    retryCount: 3,
    schedule: '0 4 * * *',
    serviceAccount: GTFS_WRITER_SERVICE_ACCOUNT,
    timeZone: 'America/New_York',
    timeoutSeconds: 1800,
  },
  refreshAllGtfsSnapshots,
);

/** Push new service alerts on riders' saved lines (routeAlerts.ts), every five minutes. */
export const sendRouteAlerts = onSchedule(
  {
    maxInstances: 1,
    retryCount: 0,
    schedule: '*/5 * * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 240,
    // NICE and Suffolk's alerts come from Swiftly.
    secrets: [swiftlyApiKey],
  },
  async () => {
    const { sent } = await sendSavedRouteAlerts();
    if (sent > 0) logger.info('Sent saved-route alerts', { sent });
  },
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
  // An agency whose timetable isn't published yet (a new on-demand one) has no routes to serve.
  if (!isAgencyAvailable(agencyId)) throw new HttpsError('unavailable', `agencyId "${agencyId}" has no timetable yet`);
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
export const getRouteLiveStatus = onCall<RouteLiveStatusRequest>({ ...liveStatusCallableOptions, secrets: [swiftlyApiKey, mtaBusTimeApiKey] }, async (request) => {
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
  const [status, nearestStop, alerts] = await Promise.all([
    getRouteStatus(agencyId, routeId),
    location ? getNearestStopForRoute(agencyId, routeId, location.lat, location.lon).catch(() => null) : Promise.resolve(null),
    getRouteAlerts(agencyId, routeId),
  ]);
  direction1StopId = nearestStop?.direction1?.stopId ?? direction1StopId;
  direction0StopId = nearestStop?.direction0?.stopId ?? direction0StopId;
  const stopPredictions = await getStopPredictions(agencyId, routeId, direction1StopId, direction0StopId, status.trips);
  return { ...status, stopPredictions, alerts, ...(hasLocation ? { nearestStop } : {}) };
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
// minInstances 0 stated outright, so a deploy clears the earlier always-on setting (it billed while idle).
export const getRoutesLiveStatus = onCall<RoutesLiveStatusRequest>({ ...liveStatusCallableOptions, minInstances: 0, secrets: [swiftlyApiKey, mtaBusTimeApiKey] }, async (request) => {
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
export const getStopDepartures = onCall<StopDeparturesRequest>({ ...liveStatusCallableOptions, secrets: [swiftlyApiKey, mtaBusTimeApiKey] }, async (request) => {
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

/** Sent once by the app when it opens; see warmTransitInstance. */
type WarmupRequest = { warmup?: boolean };

/**
 * How many agencies' timetables a cold instance downloads at once. One at a time took ~15 s for
 * all twelve; every agency at once could buffer too many ZIPs for a 1 GiB instance.
 */
const AGENCY_PREPARE_CONCURRENCY = 3;

/** Readies every agency's timetable, a few downloads at a time. `tolerant`: one agency's failure doesn't fail the rest. */
async function prepareAllAgencyStaticData({ tolerant = false }: { tolerant?: boolean } = {}): Promise<void> {
  const queue = Object.keys(AGENCY_CONFIGS) as AgencyId[];
  const worker = async () => {
    for (let agencyId = queue.shift(); agencyId; agencyId = queue.shift()) {
      const preparing = prepareAgencyStaticData(agencyId);
      await (tolerant ? preparing.catch(() => undefined) : preparing);
    }
  };
  await Promise.all(Array.from({ length: AGENCY_PREPARE_CONCURRENCY }, worker));
}

/**
 * Answers a `{ warmup: true }` call: brings this (possibly cold) instance's static data up —
 * every agency's current snapshot and small files, plus the stop indexes nearby search starts
 * from — so the rider's first real request finds it ready. Returns no transit data. The app waits
 * for this before its first real call, since with concurrency 1 a request arriving mid-warm-up
 * would otherwise start a second cold instance.
 */
async function warmTransitInstance({ stopIndexes }: { stopIndexes: boolean }): Promise<{ warmed: true }> {
  await prepareAllAgencyStaticData();
  for (const agencyId of Object.keys(AGENCY_CONFIGS) as AgencyId[]) {
    if (!isAgencyAvailable(agencyId)) continue;
    loadAgencyStaticData(agencyId);
    if (stopIndexes) await loadGlobalStopRouteIndex(agencyId);
  }
  return { warmed: true };
}

type FindNearbyTransitRequest = { lat: number; lon: number } & WarmupRequest;

/**
 * Every real route, on every configured agency, near a point — not limited to the handful of
 * routes this app has hand-built UI for. Each result already carries its own nearest stop and
 * both directions' real headsigns/stop_ids, ready to pass straight into getRouteLiveStatus for
 * live predictions, or getRouteGeometry for a real map.
 * Client call: httpsCallable(functions, 'findNearbyTransit')({ lat, lon }), or ({ warmup: true }).
 */
// minInstances 0 stated outright, so a deploy clears the earlier always-on setting (it billed while idle).
export const findNearbyTransit = onCall<FindNearbyTransitRequest>({ ...protectedCallableOptions, minInstances: 0 }, async (request) => {
  await enforceCallableSecurity(request, 'findNearbyTransit', RATE_LIMITS.findNearbyTransit);
  if (request.data?.warmup === true) return warmTransitInstance({ stopIndexes: true });
  const { lat, lon } = requiredCoordinates(request.data?.lat, request.data?.lon);
  await prepareAllAgencyStaticData();
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

type WalkingPathRequest = { agencyId: AgencyId; stopId: string; lat: number; lon: number };

/**
 * The walk from the rider to a stop along the streets (walkingGraph.ts), for route detail's
 * dotted line to the stop it shows. `walk` is null where there's no walk to draw: no walking data
 * on this instance, the stop is out of walking range, or it can't be reached on foot.
 * Client call: httpsCallable(functions, 'getWalkingPath')({ agencyId, stopId, lat, lon }).
 */
export const getWalkingPath = onCall<WalkingPathRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'getWalkingPath', RATE_LIMITS.getWalkingPath);
  const data = request.data ?? ({} as WalkingPathRequest);
  const agencyId = requiredAgencyId(data.agencyId);
  await prepareAgencyStaticData(agencyId);
  const stopId = requiredString(data.stopId, 'stopId');
  const { lat, lon } = requiredCoordinates(data.lat, data.lon);
  return { walk: getWalkingPathToStop(agencyId, stopId, lat, lon) };
});

type RouteGeometryRequest = { agencyId: AgencyId; routeId: string; directionId: 0 | 1 } & WarmupRequest;

/**
 * A representative real station sequence for any route's direction on any configured agency,
 * derived generically from its longest scheduled trip — not limited to routes with hand-built
 * geometry. See gtfsDiscovery.ts for the "longest trip" caveat on branches that split partway
 * (e.g. LIRR's Port Jefferson Branch at Huntington).
 * Client call: httpsCallable(functions, 'getRouteGeometry')({ agencyId, routeId, directionId }), or ({ warmup: true }).
 */
export const getRouteGeometry = onCall<RouteGeometryRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'getRouteGeometry', RATE_LIMITS.getRouteGeometry);
  if (request.data?.warmup === true) return warmTransitInstance({ stopIndexes: false });
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

/**
 * Every line of one agency, simplified, for the home map's line layers ("all subway lines").
 * Client call: httpsCallable(functions, 'getAgencyLines')({ agencyId }).
 */
export const getAgencyLines = onCall<{ agencyId: AgencyId }>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'getAgencyLines', RATE_LIMITS.getAgencyLines);
  const agencyId = requiredAgencyId(request.data?.agencyId);
  // On-demand agencies (S76/S74's MTA Bus files) are fetched here; one with no data has no lines.
  await prepareAgencyStaticData(agencyId).catch(() => undefined);
  if (!isAgencyAvailable(agencyId)) return { lines: [] };
  return { lines: await getAgencyLinesDiscovery(agencyId) };
});

/**
 * The agency's stops a wheelchair user can board at, for route view's wheelchair marks.
 * Client call: httpsCallable(functions, 'getAccessibleStops')({ agencyId }).
 */
export const getAccessibleStops = onCall<{ agencyId: AgencyId }>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'getAccessibleStops', RATE_LIMITS.getAccessibleStops);
  const agencyId = requiredAgencyId(request.data?.agencyId);
  await prepareAgencyStaticData(agencyId).catch(() => undefined);
  if (agencyId !== 'subway' && !isAgencyAvailable(agencyId)) return { everyStop: false, stopIds: [] };
  return findAccessibleStops(agencyId);
});

/**
 * Lines a rider can change to at each stop of a route's direction, keyed by stop id. Separate from
 * getRouteGeometry because it reads every agency's data: the stop list shows first, badges after.
 * Client call: httpsCallable(functions, 'getRouteTransfers')({ agencyId, routeId, directionId }).
 */
export const getRouteTransfers = onCall<RouteGeometryRequest>(protectedCallableOptions, async (request): Promise<{ transfers: Record<string, StopTransfer[]> }> => {
  await enforceCallableSecurity(request, 'getRouteTransfers', RATE_LIMITS.getRouteGeometry);
  const data = request.data ?? ({} as RouteGeometryRequest);
  const agencyId = requiredAgencyId(data.agencyId);
  await prepareAgencyStaticData(agencyId);
  const routeId = requiredRouteId(agencyId, data.routeId);
  const { directionId } = data;
  if (directionId !== 0 && directionId !== 1) throw new HttpsError('invalid-argument', 'directionId must be 0 or 1');
  await prepareAllAgencyStaticData();
  return { transfers: await getRouteTransfersDiscovery(agencyId, routeId, directionId) };
});

type SearchTransitRoutesRequest = { query?: unknown; lat?: unknown; lon?: unknown } & WarmupRequest;

/**
 * Lines whose name matches a search ("1", "B46", "Port Jefferson"), each with its stops nearest
 * the given point, so search can open them in route view.
 * Client call: httpsCallable(functions, 'searchTransitRoutes')({ query, lat, lon }).
 */
export const searchTransitRoutes = onCall<SearchTransitRoutesRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'searchTransitRoutes', RATE_LIMITS.searchTransitRoutes);
  // Opening search warms an instance, so the first line typed doesn't wait on every agency loading.
  if (request.data?.warmup === true) return warmTransitInstance({ stopIndexes: false });
  const query = requiredString(request.data?.query, 'query', 40);
  const { lat, lon } = requiredCoordinates(request.data?.lat, request.data?.lon);
  await prepareAllAgencyStaticData();
  return { routes: await searchRoutes(query, lat, lon) };
});

/**
 * Every line's name, agency and color, for searching lines on the device as the rider types.
 * Client call: httpsCallable(functions, 'listTransitLines')({}).
 */
export const listTransitLines = onCall(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'listTransitLines', RATE_LIMITS.listTransitLines);
  await prepareAllAgencyStaticData({ tolerant: true });
  return { lines: listLines() };
});

type DescribeTransitRouteRequest = { agencyId?: unknown; routeId?: unknown; lat?: unknown; lon?: unknown } & WarmupRequest;

/**
 * One line described like a Nearby card, at its stops nearest a point: route view opens a tapped
 * stop, or a transfer badge's line, this way.
 * Client call: httpsCallable(functions, 'describeTransitRoute')({ agencyId, routeId, lat, lon }).
 */
export const describeTransitRoute = onCall<DescribeTransitRouteRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'describeTransitRoute', RATE_LIMITS.describeTransitRoute);
  // Search warms one as it opens, so a tapped line opens without a cold start.
  if (request.data?.warmup === true) return warmTransitInstance({ stopIndexes: false });
  const agencyId = requiredAgencyId(request.data?.agencyId);
  await prepareAgencyStaticData(agencyId);
  const routeId = requiredRouteId(agencyId, request.data?.routeId);
  const { lat, lon } = requiredCoordinates(request.data?.lat, request.data?.lon);
  const route = await describeRoute(agencyId, routeId, lat, lon);
  if (!route) throw new HttpsError('not-found', `No usable stops for ${agencyId} route "${routeId}"`);
  return { route };
});

const TRIP_MODES: readonly TravelModeOption[] = ['subway', 'bus', 'rail'];
const TRIP_PREFERENCES: readonly TripPreference[] = ['fastest', 'transfers', 'cheapest'];
// The Routes API plans transit from 7 days ago to 100 days ahead.
const TRIP_TIME_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const TRIP_TIME_FUTURE_MS = 100 * 24 * 60 * 60 * 1000;
const ROUTES_TIMEOUT_MS = 15_000;

function outOfArea(): HttpsError {
  return new HttpsError('invalid-argument', 'This trip is outside the area Pathly covers.', { reason: 'out-of-area' });
}

function badTripRequest(message: string): HttpsError {
  return new HttpsError('invalid-argument', message, { reason: 'bad-request' });
}

function requiredEndpoint(value: unknown, name: string): TripEndpoint {
  if (!value || typeof value !== 'object') throw badTripRequest(`${name} is required`);
  const { placeId, lat, lng, label } = value as Record<string, unknown>;
  if (typeof label !== 'string' || label.length === 0 || label.length > 200) throw badTripRequest(`${name}.label is invalid`);
  const hasPlace = placeId !== undefined;
  if (hasPlace && (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{1,300}$/.test(placeId))) throw badTripRequest(`${name}.placeId is invalid`);
  const hasCoordinates = lat !== undefined || lng !== undefined;
  if (hasCoordinates) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) throw badTripRequest(`${name} coordinates are invalid`);
    if (!isInServiceArea(lat, lng)) throw outOfArea();
  }
  if (!hasPlace && !hasCoordinates) throw badTripRequest(`${name} needs a placeId or coordinates`);
  return { label, ...(hasPlace ? { placeId: placeId as string } : {}), ...(hasCoordinates ? { lat: lat as number, lng: lng as number } : {}) };
}

/** Validates a planTrip request; endpoints given as coordinates must be in the service area. */
export function requiredPlanTripRequest(data: unknown, nowMs = Date.now()): PlanTripRequest {
  const request = (data ?? {}) as Record<string, unknown>;
  const origin = requiredEndpoint(request.origin, 'origin');
  const destination = requiredEndpoint(request.destination, 'destination');

  const time = request.time as Record<string, unknown> | undefined;
  let tripTime: PlanTripRequest['time'];
  if (time?.mode === 'now') {
    tripTime = { mode: 'now' };
  } else if ((time?.mode === 'depart' || time?.mode === 'arrive') && typeof time.at === 'string') {
    const at = Date.parse(time.at);
    if (!Number.isFinite(at) || at < nowMs - TRIP_TIME_PAST_MS || at > nowMs + TRIP_TIME_FUTURE_MS) throw badTripRequest('time.at is outside the plannable window');
    tripTime = { mode: time.mode, at: new Date(at).toISOString() };
  } else {
    throw badTripRequest('time is invalid');
  }

  const { preference, modes } = request;
  if (typeof preference !== 'string' || !TRIP_PREFERENCES.includes(preference as TripPreference)) throw badTripRequest('preference is invalid');
  if (!Array.isArray(modes) || modes.length === 0 || modes.some((mode) => !TRIP_MODES.includes(mode as TravelModeOption))) throw badTripRequest('modes are invalid');
  if (request.lessWalking !== undefined && typeof request.lessWalking !== 'boolean') throw badTripRequest('lessWalking is invalid');
  return {
    origin,
    destination,
    time: tripTime,
    preference: preference as TripPreference,
    modes: [...new Set(modes as TravelModeOption[])],
    ...(request.lessWalking === true ? { lessWalking: true } : {}),
  };
}

/**
 * Real transit itineraries between two places, from the Google Routes API (computeRoutes,
 * TRANSIT, with alternatives), reshaped into the app's itinerary format (tripPlanning.ts).
 * The Maps key stays server-side. An empty list means Google found no transit trip.
 * Client call: httpsCallable(functions, 'planTrip')({ origin, destination, time, preference, modes, lessWalking? }).
 */
export const planTrip = onCall<PlanTripRequest, Promise<{ itineraries: Itinerary[] }>>(
  { ...protectedCallableOptions, secrets: [googleMapsApiKey], timeoutSeconds: 30 },
  async (request) => {
    await enforceCallableSecurity(request, 'planTrip', RATE_LIMITS.planTrip);
    const nowMs = Date.now();
    const trip = requiredPlanTripRequest(request.data, nowMs);

    let body: RoutesResponse & { error?: { status?: string; message?: string } };
    let status: number;
    try {
      const response = await fetch(ROUTES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleMapsApiKey.value(), 'X-Goog-FieldMask': ROUTES_FIELD_MASK },
        body: JSON.stringify(buildRoutesRequest(trip)),
        signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS),
      });
      status = response.status;
      body = (await response.json()) as typeof body;
    } catch (error) {
      logger.warn('Trip planning request failed', { event: 'trip_planning_unavailable', reason: error instanceof Error ? error.message : String(error) });
      throw new HttpsError('unavailable', 'Trips could not be loaded right now.');
    }
    if (status < 200 || status >= 300 || body.error) {
      logger.warn('Trip planning request was rejected', { event: 'trip_planning_unavailable', httpStatus: status, googleStatus: body.error?.status, reason: body.error?.message });
      throw new HttpsError('unavailable', 'Trips could not be loaded right now.');
    }

    // Endpoints given only as a place are checked against the service area here, where the
    // route says where they are.
    const legs = body.routes?.[0]?.legs ?? [];
    const ends = [legs[0]?.startLocation, legs.at(-1)?.endLocation].map((location) => location?.latLng);
    if (ends.some((point) => point?.latitude !== undefined && point.longitude !== undefined && !isInServiceArea(point.latitude, point.longitude))) throw outOfArea();

    const requestTime = trip.time.mode === 'now' ? new Date(nowMs).toISOString() : trip.time.at;
    // Google has no fares for the LIRR, NICE, or Suffolk; estimate those from published fares.
    await prepareAgencyStaticData('lirr');
    const estimateFare = createFareEstimator(loadAgencyStaticData('lirr').stopsById.values());
    const itineraries = normalizeRoutesResponse(body, requestTime, trip.destination.label, estimateFare);
    // Stops in between come from Pathly's own timetables (Google gives only a count); any leg not
    // matched within the budget simply goes without.
    const agencies = new Set(itineraries.flatMap((itinerary) => itinerary.steps.flatMap((step) => (step.kind === 'transit' ? agencyIdsForStep(step) : []))));
    for (const agencyId of agencies) await prepareAgencyStaticData(agencyId);
    return { itineraries: await addTripStops(itineraries, TRIP_STOPS_BUDGET_MS, tripStopMatcher) };
  },
);

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

type ReverseGeocodeRequest = { lat?: unknown; lon?: unknown };
type ReverseGeocodingApiResponse = { status: string; results: { formatted_address: string; place_id: string }[] };

/**
 * The street address at a point, for "Choose on map": "123 Main St" and "Stony Brook, NY 11790".
 * Client call: httpsCallable(functions, 'reverseGeocode')({ lat, lon }).
 */
export const reverseGeocode = onCall<ReverseGeocodeRequest>(
  { ...protectedCallableOptions, memory: '256MiB', secrets: [googleMapsApiKey], timeoutSeconds: 15 },
  async (request) => {
    await enforceCallableSecurity(request, 'reverseGeocode', RATE_LIMITS.reverseGeocode);
    const { lat, lon } = requiredCoordinates(request.data?.lat, request.data?.lon);
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lon}`);
    url.searchParams.set('result_type', 'street_address|premise|route|intersection');
    url.searchParams.set('key', googleMapsApiKey.value());
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json()) as ReverseGeocodingApiResponse;
    const result = body.status === 'OK' ? body.results[0] : undefined;
    if (!result) return { address: null };
    const [title = result.formatted_address, ...rest] = result.formatted_address.replace(/, USA$/, '').split(', ');
    return { address: { placeId: result.place_id, title, subtitle: rest.join(', ') } };
  },
);

/**
 * Admin-only health of the backend: each agency's published timetable snapshot and its age, the
 * last scheduled refresh, whether its live feed answers, and the caller's own rate-limit allowance.
 * Client call: httpsCallable(functions, 'getBackendStatus')().
 */
export const getBackendStatus = onCall({ ...protectedCallableOptions, secrets: [swiftlyApiKey, mtaBusTimeApiKey] }, async (request) => {
  const uid = await enforceCallableSecurity(request, 'getBackendStatus', RATE_LIMITS.getBackendStatus);
  requireAdmin(request);
  const [agencies, myRateLimits] = await Promise.all([collectBackendStatus(), peekRateLimits(uid, RATE_LIMITS)]);
  return { checkedAt: new Date().toISOString(), agencies, myRateLimits };
});

type SearchTransitStopsRequest = { query?: string; near?: { lat: number; lng: number }; stations?: StationLookup[] };

const MAX_STATION_LOOKUPS = 8;
const STATION_KINDS = new Set(['subway', 'rail', 'bus', 'ferry']);

function requiredStations(value: unknown): StationLookup[] {
  if (!Array.isArray(value) || value.length > MAX_STATION_LOOKUPS) {
    throw new HttpsError('invalid-argument', `stations must be a list of at most ${MAX_STATION_LOOKUPS}`);
  }
  return value.map((station: unknown) => {
    const { name, kind } = (station ?? {}) as Partial<StationLookup>;
    if (typeof kind !== 'string' || !STATION_KINDS.has(kind)) throw new HttpsError('invalid-argument', 'station kind is invalid');
    return { name: requiredString(name, 'station name', 120), kind };
  });
}

/**
 * Pathly's own stops whose names match a search query, each with the lines serving it, for the
 * destination search screen (Google's suggestions don't say which lines stop at a station). With
 * `stations` instead, finds the Pathly stop for each of Google's station suggestions.
 * Client call: httpsCallable(functions, 'searchTransitStops')({ query, near? } | { stations, near? }).
 */
export const searchTransitStops = onCall<SearchTransitStopsRequest>(protectedCallableOptions, async (request) => {
  await enforceCallableSecurity(request, 'searchTransitStops', RATE_LIMITS.searchTransitStops);
  const stations = request.data?.stations === undefined ? undefined : requiredStations(request.data.stations);
  const query = stations ? undefined : requiredString(request.data?.query, 'query', 80);
  const near = request.data?.near;
  const point = near === undefined ? undefined : (() => {
    const { lat, lon } = requiredCoordinates(near?.lat, near?.lng);
    return { lat, lng: lon };
  })();
  await prepareAllAgencyStaticData();
  if (stations) return { stations: await lookupStations(stations, point) };
  return { stops: await searchStops(query!, point) };
});
