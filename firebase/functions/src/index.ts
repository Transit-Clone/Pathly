import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/** Set once with: firebase functions:secrets:set GOOGLE_MAPS_API_KEY */
const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

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
