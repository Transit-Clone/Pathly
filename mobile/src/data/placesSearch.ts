import { SERVICE_AREA_BOUNDS } from './serviceArea';

/** What kind of place a suggestion is, for its icon: a transit stop's mode, or any other place. */
export type PlaceKind = 'place' | 'subway' | 'rail' | 'bus' | 'ferry';

/** A line serving a transit stop, as its route badge shows it. */
export type StopRoute = { shortName: string; color: string };

/** A destination the rider can pick: a Google place suggestion, a resolved place, a transit stop, or a recent. */
export type SearchPlace = {
  id: string;
  title: string;
  subtitle: string;
  location?: { latitude: number; longitude: number };
  /** Absent on older recents, which read as plain places. */
  kind?: PlaceKind;
  /** The lines serving a transit stop from Pathly's own data. */
  routes?: readonly StopRoute[];
  /** The agency whose stop this is (its badges' agency), for Pathly stops. */
  agency?: string;
  source?: 'google' | 'pathly';
};

/** A Google suggestion's kind from its place types: the first transit type it has, else a plain place. */
export function placeKindForTypes(types: readonly string[] | undefined): PlaceKind {
  for (const type of types ?? []) {
    if (type === 'subway_station') return 'subway';
    if (type === 'train_station' || type === 'light_rail_station') return 'rail';
    if (type === 'bus_station') return 'bus';
    if (type === 'ferry_terminal') return 'ferry';
  }
  // A transit station of no more specific type is most often a rail station.
  return types?.includes('transit_station') ? 'rail' : 'place';
}

/** Street words Google writes both ways ("William St" in one reply, "William Street" in another). */
const ADDRESS_WORDS: Record<string, string> = {
  street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', place: 'pl', lane: 'ln',
  court: 'ct', parkway: 'pkwy', highway: 'hwy', turnpike: 'tpke', east: 'e', west: 'w', north: 'n', south: 's',
};

function addressKey(text: string): string {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((word) => ADDRESS_WORDS[word] ?? word).join(' ');
}

/**
 * A place's second line, completing its first: the rest of the address under a street address
 * ("123 William Street" / "New York, NY"), or the whole address under a named place. The country
 * is dropped, and so is a repeat of the first line at the address's start.
 */
export function addressAfterName(title: string, address: string): string {
  let parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && /^(usa|united states)$/i.test(parts.at(-1)!)) parts = parts.slice(0, -1);
  if (parts.length > 1 && addressKey(parts[0]!) === addressKey(title)) parts = parts.slice(1);
  return parts.join(', ');
}

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
      types?: string[];
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
    const { placeId, structuredFormat, text, types } = placePrediction;
    return [{
      id: placeId,
      title: structuredFormat?.mainText?.text ?? text?.text ?? '',
      subtitle: structuredFormat?.secondaryText?.text ?? '',
      kind: placeKindForTypes(types),
      source: 'google' as const,
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
