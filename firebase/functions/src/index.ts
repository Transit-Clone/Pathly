import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { findNearbyTransit as findNearbyTransitDiscovery, getNearestStopForRoute, getRouteGeometry as getRouteGeometryDiscovery } from './gtfsDiscovery';
import type { AgencyId } from './gtfsAgencies';
import { getStopPredictions } from './gtfsSchedule';
import { getRouteStatus } from './gtfsStatus';

/** Set once with: firebase functions:secrets:set GOOGLE_MAPS_API_KEY */
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');
/** Set once with: firebase functions:secrets:set SWIFTLY_API_KEY. Needed for NICE Bus/Suffolk County Transit's real-time feeds (hosted by Swiftly, a third-party provider); not used by LIRR or subway. */
const swiftlyApiKey = defineSecret('SWIFTLY_API_KEY');

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
export const getRouteLiveStatus = onCall<RouteLiveStatusRequest>({ secrets: [swiftlyApiKey] }, async (request) => {
  const { agencyId, routeId, lat, lon } = request.data ?? {};
  let { direction1StopId, direction0StopId } = request.data ?? {};
  if (!agencyId) throw new HttpsError('invalid-argument', 'agencyId is required');
  if (!routeId) throw new HttpsError('invalid-argument', 'routeId is required');
  if (!direction1StopId) throw new HttpsError('invalid-argument', 'direction1StopId is required');
  if (!direction0StopId) throw new HttpsError('invalid-argument', 'direction0StopId is required');

  // With the rider's location, the nearest stop is resolved here (in parallel with the live
  // feed) rather than by a separate prior call, so a route needs one round trip, not two. Each
  // direction falls back to the given stop id if it can't be resolved.
  const hasLocation = typeof lat === 'number' && typeof lon === 'number';
  const [status, nearestStop] = await Promise.all([
    getRouteStatus(agencyId, routeId),
    hasLocation ? getNearestStopForRoute(agencyId, routeId, lat, lon).catch(() => null) : Promise.resolve(null),
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
export const findNearbyTransit = onCall<FindNearbyTransitRequest>(async (request) => {
  const { lat, lon } = request.data ?? {};
  if (typeof lat !== 'number' || typeof lon !== 'number') throw new HttpsError('invalid-argument', 'lat and lon are required');
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
export const getNearestRouteStop = onCall<NearestRouteStopRequest>(async (request) => {
  const { agencyId, routeId, lat, lon } = request.data ?? {};
  if (!agencyId) throw new HttpsError('invalid-argument', 'agencyId is required');
  if (!routeId) throw new HttpsError('invalid-argument', 'routeId is required');
  if (typeof lat !== 'number' || typeof lon !== 'number') throw new HttpsError('invalid-argument', 'lat and lon are required');

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
export const getRouteGeometry = onCall<RouteGeometryRequest>(async (request) => {
  const { agencyId, routeId, directionId } = request.data ?? {};
  if (!agencyId) throw new HttpsError('invalid-argument', 'agencyId is required');
  if (!routeId) throw new HttpsError('invalid-argument', 'routeId is required');
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
  { secrets: [googleMapsApiKey] },
  async (request) => {
    const address = request.data.address?.trim();
    if (!address) throw new HttpsError('invalid-argument', 'address is required');

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
