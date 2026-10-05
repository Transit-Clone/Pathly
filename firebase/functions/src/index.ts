import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { getStopPredictions } from './lirrSchedule';
import { getLirrBranchStatus } from './lirrStatus';

/** Set once with: firebase functions:secrets:set GOOGLE_MAPS_API_KEY */
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

type LirrBranchLiveStatusRequest = { routeId: string; stopId: string };

/**
 * Live LIRR trip updates (stop names/coordinates resolved via the static GTFS data, delays
 * from the real-time feed) for any branch/stop, plus departure predictions at `stopId` that
 * fall back to the real published timetable — never a placeholder — whenever the real-time
 * feed has nothing upcoming for a direction. Generalized over route_id/stop_id (rather than
 * hardcoded to Port Jefferson/Stony Brook) so additional LIRR branches can reuse this same
 * function later; see routes.txt/stops.txt in firebase/functions/static_data/lirr for valid
 * IDs. No API key needed for this feed.
 * Client call: httpsCallable(functions, 'getLirrBranchLiveStatus')({ routeId, stopId }).
 */
export const getLirrBranchLiveStatus = onCall<LirrBranchLiveStatusRequest>(async (request) => {
  const { routeId, stopId } = request.data ?? {};
  if (!routeId) throw new HttpsError('invalid-argument', 'routeId is required');
  if (!stopId) throw new HttpsError('invalid-argument', 'stopId is required');

  const status = await getLirrBranchStatus(routeId);
  const stopPredictions = getStopPredictions(routeId, stopId, status.trips);
  return { ...status, stopPredictions };
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
