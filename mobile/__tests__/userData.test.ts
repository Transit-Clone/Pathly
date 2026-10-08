import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import {
  findSavedLocation,
  locationToPlace,
  placeFromName,
  placeToLocation,
  recordSearch,
  removeSavedLocation,
  removeSearch,
  saveLocation,
  subscribeToSavedLocations,
  subscribeToSearches,
  type SavedLocation,
} from '../src/data/userData';

const place = { id: 'places/abc', title: 'Stony Brook University', subtitle: '100 Nicolls Rd, Stony Brook, NY', location: { latitude: 40.91, longitude: -73.12 } };

describe('userData', () => {
  beforeEach(() => jest.clearAllMocks());

  it('round-trips a place through the Location shape', () => {
    const location = placeToLocation(place, 'Start');
    expect(location).toEqual({ streetAddress: place.subtitle, name: place.title, coordinates: [40.91, -73.12], type: 'Start', placeId: place.id });
    expect(locationToPlace(location)).toEqual(place);
  });

  it('leaves out coordinates for places that never had them', () => {
    const { location, ...withoutLocation } = place;
    expect(location).toBeDefined();
    expect(locationToPlace(placeToLocation(withoutLocation, 'Destination'))).toEqual(withoutLocation);
  });

  it('keys search entries by an encoded place id so repeats overwrite', async () => {
    await recordSearch('uid-1', place);
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'users', 'uid-1', 'searches', 'places%2Fabc');
    expect(setDoc).toHaveBeenCalledWith({ path: 'users/uid-1/searches/places%2Fabc' }, expect.objectContaining({ address: expect.objectContaining({ type: 'Destination' }) }));
  });

  it('maps snapshot docs to newest-first entries', () => {
    const address = placeToLocation(place, 'Destination');
    jest.mocked(onSnapshot).mockImplementationOnce(((_query: unknown, onNext: (snapshot: unknown) => void) => {
      onNext({ docs: [{ id: 'places%2Fabc', data: () => ({ address, dateSearched: { toDate: () => new Date(0) } }) }] });
      return () => undefined;
    }) as never);
    const onChange = jest.fn();
    subscribeToSearches('uid-1', 5, onChange);
    expect(onChange).toHaveBeenCalledWith([{ id: 'places%2Fabc', address, dateSearched: new Date(0) }]);
  });

  it('saves and removes locations, newest first', async () => {
    let saved: SavedLocation[] = [];
    subscribeToSavedLocations('uid-1', 10, (entries) => {
      saved = entries;
    });
    await saveLocation('uid-1', place, 'Destination');
    await saveLocation('uid-1', placeFromName('Times Square'), 'Destination');
    expect(saved.map((entry) => entry.address.name)).toEqual(['Times Square', place.title]);

    await removeSavedLocation('uid-1', place.id);
    expect(saved.map((entry) => entry.address.name)).toEqual(['Times Square']);
  });

  it('finds a saved location by Places id, or by name when only the name matches', () => {
    const saved: SavedLocation[] = [{ id: 'a', address: placeToLocation(placeFromName('Times Square'), 'Destination'), dateSaved: null }];
    expect(findSavedLocation(saved, placeFromName('Times Square'))).toBe(saved[0]);
    expect(findSavedLocation(saved, { id: 'places/ts', title: 'Times Square', subtitle: 'Manhattan' })).toBe(saved[0]);
    expect(findSavedLocation(saved, place)).toBeUndefined();
  });

  it('removes a search from the history', async () => {
    let searches: string[] = [];
    subscribeToSearches('uid-1', 10, (entries) => {
      searches = entries.map((entry) => entry.address.name);
    });
    await recordSearch('uid-1', place);
    expect(searches).toEqual([place.title]);
    await removeSearch('uid-1', place.id);
    expect(searches).toEqual([]);
  });
});
