import { SERVICE_AREA_BOUNDS } from './serviceArea';

/** A destination the rider can pick: a Google place suggestion, a resolved place, or a sample recent. */
export type SearchPlace = {
  id: string;
  title: string;
  subtitle: string;
  location?: { latitude: number; longitude: number };
};

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const DETAILS_FIELD_MASK = 'id,displayName,formattedAddress,location';

export class PlacesRequestError extends Error {
  constructor(readonly status: number) {
    super(`Places request failed with status ${status}`);
    this.name = 'PlacesRequestError';
  }
}

/** Dedicated Places key if set, else the web Maps key (same Cloud project). Empty string when unconfigured. */
export function getPlacesApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || '';
}

/**
 * Groups autocomplete calls and the final details call into one billed session.
 * Google only needs a UUIDv4-shaped opaque string, so Math.random is sufficient here.
 */
export function createSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function headers(apiKey: string, fieldMask?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
  };
}

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    };
  }[];
};

type AutocompleteOptions = {
  input: string;
  sessionToken: string;
  signal?: AbortSignal;
};

/**
 * Place suggestions for `input`, restricted to the Pathly service area (NYC, Nassau, Suffolk):
 * Pathly can't route outside its network, so out-of-area places are never offered.
 * Widening SERVICE_AREA_BOUNDS widens search along with the map.
 */
export async function autocompletePlaces({ input, sessionToken, signal }: AutocompleteOptions): Promise<SearchPlace[]> {
  const response = await fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: 'POST',
    headers: headers(getPlacesApiKey()),
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ['us'],
      locationRestriction: {
        rectangle: {
          low: { latitude: SERVICE_AREA_BOUNDS.south, longitude: SERVICE_AREA_BOUNDS.west },
          high: { latitude: SERVICE_AREA_BOUNDS.north, longitude: SERVICE_AREA_BOUNDS.east },
        },
      },
    }),
    signal,
  });
  if (!response.ok) throw new PlacesRequestError(response.status);

  const data = (await response.json()) as AutocompleteResponse;
  return (data.suggestions ?? []).flatMap(({ placePrediction }) => {
    if (!placePrediction) return [];
    const { placeId, structuredFormat, text } = placePrediction;
    return [{
      id: placeId,
      title: structuredFormat?.mainText?.text ?? text?.text ?? '',
      subtitle: structuredFormat?.secondaryText?.text ?? '',
    }];
  });
}

type PlaceDetailsResponse = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
};

type PlaceDetailsOptions = {
  placeId: string;
  sessionToken: string;
  signal?: AbortSignal;
};

/** Resolves a suggestion to its display name, address, and coordinates; ends the billing session. */
export async function fetchPlaceDetails({ placeId, sessionToken, signal }: PlaceDetailsOptions): Promise<SearchPlace> {
  const url = `${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
  const response = await fetch(url, { headers: headers(getPlacesApiKey(), DETAILS_FIELD_MASK), signal });
  if (!response.ok) throw new PlacesRequestError(response.status);

  const data = (await response.json()) as PlaceDetailsResponse;
  return {
    id: data.id,
    title: data.displayName?.text ?? data.formattedAddress ?? '',
    subtitle: data.formattedAddress ?? '',
    location: data.location,
  };
}
