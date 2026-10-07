import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { enforceCallableSecurity, type CallableRateLimit } from './callableSecurity';
import { findNearbyTransit as findNearbyTransitDiscovery, getNearestStopForRoute, getRouteGeometry as getRouteGeometryDiscovery } from './gtfsDiscovery';
import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { getStopPredictions } from './gtfsSchedule';
import { loadAgencyStaticData } from './gtfsStaticData';
import { getRouteStatus } from './gtfsStatus';

/** Set once with: firebase functions:secrets:set GOOGLE_MAPS_API_KEY */
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
/** Set once with: firebase functions:secrets:set SWIFTLY_API_KEY. Needed for NICE Bus/Suffolk County Transit's real-time feeds (hosted by Swiftly, a third-party provider); not used by LIRR or subway. */
const swiftlyApiKey = defineSecret('SWIFTLY_API_KEY');

// Keep false until web and native releases are producing valid App Check tokens. This is
// version-controlled deliberately so a deploy from a machine missing local config cannot
// silently change enforcement.
const enforceTransitAppCheck = false;
const protectedCallableOptions = { enforceAppCheck: enforceTransitAppCheck, maxInstances: 1 } as const;
const RATE_LIMITS = {
  // Live/nearest calls run per visible route every 30 seconds and after meaningful GPS updates.
  getRouteLiveStatus: { userPerMinute: 600 },
  findNearbyTransit: { userPerMinute: 30 },
  getNearestRouteStop: { userPerMinute: 600 },
  getRouteGeometry: { userPerMinute: 120 },
  geocodeAddress: { userPerMinute: 10 },
} satisfies Record<string, CallableRateLimit>;

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
export const getRouteLiveStatus = onCall<RouteLiveStatusRequest>({ ...protectedCallableOptions, secrets: [swiftlyApiKey] }, async (request) => {
  enforceCallableSecurity(request, 'getRouteLiveStatus', RATE_LIMITS.getRouteLiveStatus);
  const data = request.data ?? ({} as RouteLiveStatusRequest);
  const agencyId = requiredAgencyId(data.agencyId);
  const routeId = requiredString(data.routeId, 'routeId');
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
  enforceCallableSecurity(request, 'findNearbyTransit', RATE_LIMITS.findNearbyTransit);
  const { lat, lon } = requiredCoordinates(request.data?.lat, request.data?.lon);
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
  enforceCallableSecurity(request, 'getNearestRouteStop', RATE_LIMITS.getNearestRouteStop);
  const data = request.data ?? ({} as NearestRouteStopRequest);
  const agencyId = requiredAgencyId(data.agencyId);
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
  enforceCallableSecurity(request, 'getRouteGeometry', RATE_LIMITS.getRouteGeometry);
  const data = request.data ?? ({} as RouteGeometryRequest);
  const agencyId = requiredAgencyId(data.agencyId);
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
  { enforceAppCheck: true, maxInstances: 1, secrets: [googleMapsApiKey] },
  async (request) => {
    enforceCallableSecurity(request, 'geocodeAddress', RATE_LIMITS.geocodeAddress);
    const address = requiredString(request.data?.address, 'address', 200);

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', googleMapsApiKey.value());

    const response = await fetch(url);
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
