import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../lib/firebase';
import type { SearchPlace } from './placesSearch';

/**
 * Per-user Firestore data (see docs/Database Class Diagram.png):
 *
 *   users/{uid}                        profile: email, displayName (auth/userProfile.ts)
 *   users/{uid}/searches/{placeKey}    { address: Location, dateSearched }
 *   users/{uid}/prevDests/{placeKey}   { address: Location, dateNavigated }
 *   users/{uid}/savedLocations/{key}   { address: Location, dateSaved }
 *
 * Location is embedded in each entry rather than stored on its own. Entries are keyed by place,
 * so picking the same place again bumps its date instead of piling up duplicates.
 */

export type LocationType = 'Destination' | 'Start' | 'Stop' | 'Other';

export type Location = {
  streetAddress: string;
  name: string;
  /** [latitude, longitude] */
  coordinates: [number, number];
  type: LocationType;
  /** Google Places id (or demo id) the location came from, to map it back to a SearchPlace. */
  placeId: string;
};

export type Search = { id: string; address: Location; dateSearched: Date | null };
export type PrevDest = { id: string; address: Location; dateNavigated: Date | null };
export type SavedLocation = { id: string; address: Location; dateSaved: Date | null };

const SEARCHES = 'searches';
const PREV_DESTS = 'prevDests';
const SAVED_LOCATIONS = 'savedLocations';

/** Firestore ids can't contain '/', so place ids are encoded before use as doc ids. */
function placeKey(placeId: string) {
  return encodeURIComponent(placeId);
}

export function placeToLocation(place: SearchPlace, type: LocationType): Location {
  return {
    streetAddress: place.subtitle,
    name: place.title,
    // Demo places have no coordinates; [0, 0] keeps the shape valid until they're resolved.
    coordinates: place.location ? [place.location.latitude, place.location.longitude] : [0, 0],
    type,
    placeId: place.id,
  };
}

export function locationToPlace(location: Location): SearchPlace {
  const [latitude, longitude] = location.coordinates;
  return {
    id: location.placeId,
    title: location.name,
    subtitle: location.streetAddress,
    ...(latitude || longitude ? { location: { latitude, longitude } } : {}),
  };
}

/** A place known only by its name (e.g. a demo trip's destination), with no Places id or coordinates. */
export function placeFromName(name: string): SearchPlace {
  return { id: `name:${name}`, title: name, subtitle: '' };
}

/** The saved entry for a place: same Places id, or same name when one side only has a name. */
export function findSavedLocation(saved: readonly SavedLocation[], place: SearchPlace): SavedLocation | undefined {
  return saved.find((entry) => entry.address.placeId === place.id) ?? saved.find((entry) => entry.address.name === place.title);
}

function writeEntry(uid: string, collectionName: string, dateField: string, place: SearchPlace, type: LocationType) {
  return setDoc(doc(db, 'users', uid, collectionName, placeKey(place.id)), {
    address: placeToLocation(place, type),
    [dateField]: serverTimestamp(),
  });
}

/** Newest-first listener; `date` is null briefly while a just-written server timestamp is pending. */
function subscribeEntries<T>(
  uid: string,
  collectionName: string,
  dateField: string,
  max: number,
  toEntry: (id: string, address: Location, date: Date | null) => T,
  onChange: (entries: T[]) => void,
): Unsubscribe {
  const entriesQuery = query(collection(db, 'users', uid, collectionName), orderBy(dateField, 'desc'), limit(max));
  return onSnapshot(
    entriesQuery,
    (snapshot) => {
      onChange(
        snapshot.docs.map((entry) => {
          const data = entry.data({ serverTimestamps: 'estimate' });
          const date = (data[dateField] as Timestamp | null | undefined)?.toDate() ?? null;
          return toEntry(entry.id, data.address as Location, date);
        }),
      );
    },
    // Offline/permission errors just leave the list as it was; history is a convenience.
    () => undefined,
  );
}

export function recordSearch(uid: string, place: SearchPlace, type: LocationType = 'Destination') {
  return writeEntry(uid, SEARCHES, 'dateSearched', place, type);
}

export function removeSearch(uid: string, placeId: string) {
  return deleteDoc(doc(db, 'users', uid, SEARCHES, placeKey(placeId)));
}

export function recordNavigation(uid: string, place: SearchPlace) {
  return writeEntry(uid, PREV_DESTS, 'dateNavigated', place, 'Destination');
}

export function saveLocation(uid: string, place: SearchPlace, type: LocationType = 'Other') {
  return writeEntry(uid, SAVED_LOCATIONS, 'dateSaved', place, type);
}

export function removeSavedLocation(uid: string, placeId: string) {
  return deleteDoc(doc(db, 'users', uid, SAVED_LOCATIONS, placeKey(placeId)));
}

export function subscribeToSearches(uid: string, max: number, onChange: (searches: Search[]) => void) {
  return subscribeEntries(uid, SEARCHES, 'dateSearched', max, (id, address, dateSearched) => ({ id, address, dateSearched }), onChange);
}

export function subscribeToPrevDests(uid: string, max: number, onChange: (prevDests: PrevDest[]) => void) {
  return subscribeEntries(uid, PREV_DESTS, 'dateNavigated', max, (id, address, dateNavigated) => ({ id, address, dateNavigated }), onChange);
}

export function subscribeToSavedLocations(uid: string, max: number, onChange: (saved: SavedLocation[]) => void) {
  return subscribeEntries(uid, SAVED_LOCATIONS, 'dateSaved', max, (id, address, dateSaved) => ({ id, address, dateSaved }), onChange);
}
