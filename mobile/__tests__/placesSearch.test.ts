import {
  autocompletePlaces,
  createSessionToken,
  fetchPlaceDetails,
  getPlacesApiKey,
  PlacesRequestError,
} from '../src/data/placesSearch';
import { SERVICE_AREA_BOUNDS } from '../src/data/serviceArea';

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);

describe('placesSearch', () => {
  const originalFetch = globalThis.fetch;
  const { EXPO_PUBLIC_GOOGLE_PLACES_API_KEY, EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY } = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = 'places-key';
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  // Mutate rather than reassign process.env: Expo's env shim holds a reference to the original object.
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY = EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;
    if (EXPO_PUBLIC_GOOGLE_PLACES_API_KEY === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    if (EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;
  });

  it('prefers the Places key and falls back to the web Maps key', () => {
    expect(getPlacesApiKey()).toBe('places-key');
    delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY = 'maps-key';
    expect(getPlacesApiKey()).toBe('maps-key');
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY;
    expect(getPlacesApiKey()).toBe('');
  });

  it('creates UUIDv4-shaped session tokens', () => {
    expect(createSessionToken()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createSessionToken()).not.toBe(createSessionToken());
  });

  it('requests autocomplete restricted to the service area and maps place predictions', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      suggestions: [
        {
          placePrediction: {
            placeId: 'abc',
            text: { text: '100 Nicolls Rd, Stony Brook, NY, USA' },
            structuredFormat: { mainText: { text: '100 Nicolls Rd' }, secondaryText: { text: 'Stony Brook, NY, USA' } },
          },
        },
        { queryPrediction: { text: { text: 'nicolls rd restaurants' } } },
      ],
    }));

    const places = await autocompletePlaces({ input: '100 Nicolls', sessionToken: 'token-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(url).not.toContain('places-key');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Goog-Api-Key']).toBe('places-key');
    expect(JSON.parse(init.body)).toEqual({
      input: '100 Nicolls',
      sessionToken: 'token-1',
      includedRegionCodes: ['us'],
      locationRestriction: {
        rectangle: {
          low: { latitude: SERVICE_AREA_BOUNDS.south, longitude: SERVICE_AREA_BOUNDS.west },
          high: { latitude: SERVICE_AREA_BOUNDS.north, longitude: SERVICE_AREA_BOUNDS.east },
        },
      },
    });
    expect(places).toEqual([{ id: 'abc', title: '100 Nicolls Rd', subtitle: 'Stony Brook, NY, USA' }]);
  });

  it('returns an empty list when Google has no suggestions', async () => {
    fetchMock.mockReturnValue(jsonResponse({}));
    await expect(autocompletePlaces({ input: 'zzzz', sessionToken: 't' })).resolves.toEqual([]);
  });

  it('throws on non-2xx autocomplete responses', async () => {
    fetchMock.mockReturnValue(jsonResponse({ error: {} }, 403));
    await expect(autocompletePlaces({ input: 'a', sessionToken: 't' })).rejects.toBeInstanceOf(PlacesRequestError);
  });

  it('fetches place details with the session token and a field mask', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      id: 'abc',
      displayName: { text: 'Stony Brook University' },
      formattedAddress: '100 Nicolls Rd, Stony Brook, NY 11794, USA',
      location: { latitude: 40.91, longitude: -73.12 },
    }));

    const place = await fetchPlaceDetails({ placeId: 'abc', sessionToken: 'token-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/abc?sessionToken=token-1');
    expect(init.headers['X-Goog-Api-Key']).toBe('places-key');
    expect(init.headers['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location');
    expect(place).toEqual({
      id: 'abc',
      title: 'Stony Brook University',
      subtitle: '100 Nicolls Rd, Stony Brook, NY 11794, USA',
      location: { latitude: 40.91, longitude: -73.12 },
    });
  });

  it('throws on non-2xx details responses', async () => {
    fetchMock.mockReturnValue(jsonResponse({}, 500));
    await expect(fetchPlaceDetails({ placeId: 'abc', sessionToken: 't' })).rejects.toBeInstanceOf(PlacesRequestError);
  });
});
