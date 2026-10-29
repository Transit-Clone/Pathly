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
  updateDoc,
} from 'firebase/firestore';

import { db } from '../lib/firebase';
import type { PlaceKind, SearchPlace, StopRoute } from './placesSearch';

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
  /** A transit stop's mode, agency, and lines, so its recent row keeps its icon and badges. */
  transit?: { kind: PlaceKind; agency: string; routes: StopRoute[] };
  /** A saved place's own name ("Home", "Work", "Gym"), shown in place of the place's name. */
  label?: string;
  /** The icon the rider picked for a saved place; otherwise one follows from its name. */
  icon?: SavedPlaceIcon;
  /** The marker color the rider picked for a saved place; otherwise the brand blue. */
  color?: SavedPlaceColor;
  /** The rider's list this saved place is in ("Restaurants"); every place in a list shares its icon and color. */
  group?: string;
};

/** Icons a rider can pick for a saved place (firestore.rules allows exactly these). */
export const SAVED_PLACE_ICONS = ['home', 'work', 'school', 'place', 'favorite', 'heart', 'cafe', 'restaurant', 'cart', 'fitness', 'people', 'medical'] as const;
export type SavedPlaceIcon = (typeof SAVED_PLACE_ICONS)[number];

/** Marker colors a rider can pick for a saved place (firestore.rules allows exactly these). */
export const SAVED_PLACE_COLORS = ['blue', 'red', 'orange', 'yellow', 'green', 'teal', 'purple', 'pink', 'gray'] as const;
export type SavedPlaceColor = (typeof SAVED_PLACE_COLORS)[number];

/** The longest saved-place list name (firestore.rules allows this many characters). */
export const MAX_GROUP_NAME = 30;

/** How a saved place looks and where it's filed: picked by the rider, or left to its defaults. */
export type SavedPlaceStyle = { icon?: SavedPlaceIcon; color?: SavedPlaceColor; group?: string };

/** The longest saved-place label (firestore.rules allows this many characters). */
export const MAX_PLACE_LABEL = 40;
/** Labels a rider has at most one of: saving a new Home moves the label off the old one. */
const UNIQUE_LABELS = ['home', 'work'];

/** The most lines kept on a saved stop (firestore.rules allows this many). */
const MAX_SAVED_ROUTES = 30;

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
    ...(place.kind && place.kind !== 'place' && place.routes?.length
      ? { transit: { kind: place.kind, agency: place.agency ?? place.subtitle, routes: place.routes.slice(0, MAX_SAVED_ROUTES).map(({ shortName, color }) => ({ shortName, color })) } }
      : {}),
  };
}

/** A persisted point safe to put on a map; [0, 0] is the sentinel for a name-only place. */
export function locationPoint(location: Location): NonNullable<SearchPlace['location']> | null {
  const coordinates: unknown = location.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [latitude, longitude] = coordinates;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export function locationToPlace(location: Location): SearchPlace {
  const point = locationPoint(location);
  return {
    id: location.placeId,
    title: location.name,
    subtitle: location.streetAddress,
    ...(point ? { location: point } : {}),
    ...(location.transit ? { kind: location.transit.kind, agency: location.transit.agency, routes: location.transit.routes, source: 'pathly' as const } : {}),
  };
}

/** A place known only by its name (e.g. a demo trip's destination), with no Places id or coordinates. */
export function placeFromName(name: string): SearchPlace {
  return { id: `name:${name}`, title: name, subtitle: '' };
}

/** The saved entry for a place: same Places id, or same name when one side only has a name. */
export function findSavedLocation(saved: readonly SavedLocation[], place: SearchPlace): SavedLocation | undefined {
  const exact = saved.find((entry) => entry.address.placeId === place.id);
  if (exact) return exact;
  const nameMatches = saved.filter((entry) => (
    entry.address.name === place.title
    && (entry.address.placeId.startsWith('name:') || place.id.startsWith('name:'))
  ));
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

function writeEntry(uid: string, collectionName: string, dateField: string, place: SearchPlace, type: LocationType, label?: string, style: SavedPlaceStyle = {}) {
  const { icon, color, group } = style;
  return setDoc(doc(db, 'users', uid, collectionName, placeKey(place.id)), {
    address: { ...placeToLocation(place, type), ...(label ? { label } : {}), ...(icon ? { icon } : {}), ...(color ? { color } : {}), ...(group ? { group } : {}) },
    [dateField]: serverTimestamp(),
  });
}

/** What a saved place is called: the rider's label when it has one, else the place's own name. */
export function savedPlaceName(location: Location): string {
  return location.label?.trim() || location.name;
}

/** Home first, then Work, then the rest as saved (newest first). */
export function sortSavedLocations(saved: readonly SavedLocation[]): SavedLocation[] {
  const rank = (entry: SavedLocation) => {
    const index = UNIQUE_LABELS.indexOf(entry.address.label?.trim().toLowerCase() ?? '');
    return index < 0 ? UNIQUE_LABELS.length : index;
  };
  return saved.map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** The rider's lists, by name, each with the icon and color its places share (from its first place). */
export function savedPlaceGroups(saved: readonly SavedLocation[]): { name: string; icon?: SavedPlaceIcon; color?: SavedPlaceColor; count: number }[] {
  const groups = new Map<string, { name: string; icon?: SavedPlaceIcon; color?: SavedPlaceColor; count: number }>();
  for (const entry of saved) {
    const name = entry.address.group?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { name, icon: entry.address.icon, color: entry.address.color, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The saved place labelled Home or Work, if there is one. */
export function findLabeledLocation(saved: readonly SavedLocation[], label: string): SavedLocation | undefined {
  const wanted = label.trim().toLowerCase();
  return saved.find((entry) => entry.address.label?.trim().toLowerCase() === wanted);
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

/**
 * Saves a place under the rider's own label. Home and Work are one each, so a place that held the
 * label before is dropped from saved places (it was only saved as that label). `replacing` is the
 * place this one moves from, when the rider changed a saved place's address: the old entry goes.
 * A place in a list brings the list's other places to its icon and color, so the list stays one look.
 */
export async function saveLabeledLocation(uid: string, place: SearchPlace, label: string, saved: readonly SavedLocation[], style: SavedPlaceStyle = {}, replacing?: string) {
  const trimmed = label.trim().slice(0, MAX_PLACE_LABEL);
  const group = style.group?.trim().slice(0, MAX_GROUP_NAME) || undefined;
  const previous = UNIQUE_LABELS.includes(trimmed.toLowerCase()) ? findLabeledLocation(saved, trimmed) : undefined;
  await writeEntry(uid, SAVED_LOCATIONS, 'dateSaved', place, 'Destination', trimmed || undefined, { ...style, group });
  if (replacing && replacing !== place.id) await removeSavedLocation(uid, replacing);
  if (previous && previous.address.placeId !== place.id && previous.address.placeId !== replacing) await removeSavedLocation(uid, previous.address.placeId);
  if (group) {
    const members = saved.filter((entry) => (
      entry.address.group?.trim().toLowerCase() === group.toLowerCase()
      && entry.address.placeId !== place.id && entry.address.placeId !== replacing
      && (entry.address.icon !== style.icon || entry.address.color !== style.color || entry.address.group !== group)
    ));
    // updateDoc replaces the whole address map, so a cleared icon or color goes too.
    await Promise.all(members.map((entry) => updateDoc(
      doc(db, 'users', uid, SAVED_LOCATIONS, placeKey(entry.address.placeId)),
      { address: withStyle(entry.address, { icon: style.icon, color: style.color, group }) },
    )));
  }
}

/** A location with its icon, color and list replaced (an unset one dropped rather than written as undefined). */
function withStyle(location: Location, style: SavedPlaceStyle): Location {
  const { icon: _icon, color: _color, group: _group, ...rest } = location;
  return { ...rest, ...(style.icon ? { icon: style.icon } : {}), ...(style.color ? { color: style.color } : {}), ...(style.group ? { group: style.group } : {}) };
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
