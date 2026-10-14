import { callable } from '../lib/firebase';
import type { PlaceKind, SearchPlace, StopRoute } from './placesSearch';

/** Mirrors firebase/functions/src/stopSearch.ts's StopSuggestion. */
type StopSuggestion = {
  id: string;
  name: string;
  agencyLabel: string;
  mode: Exclude<PlaceKind, 'place' | 'ferry'>;
  location: { lat: number; lng: number };
  routes: StopRoute[];
};

const WORD_FORMS: Record<string, string> = { street: 'st', avenue: 'av', ave: 'av', road: 'rd', boulevard: 'blvd', place: 'pl', parkway: 'pkwy', square: 'sq', station: 'sta' };

/** Same as the backend's normalizeStopName: compares a Google station's name with a Pathly stop's. */
export function normalizeStopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => WORD_FORMS[word] ?? word)
    .join(' ');
}

const searchTransitStopsCallable = callable<{ query: string; near?: { lat: number; lng: number } }, { stops: StopSuggestion[] }>(
  'searchTransitStops',
  ({ stops }) => ({ count: stops.length, names: stops.map((stop) => stop.name) }),
);

/** Pathly's own stops matching `query`, as search places that already know where they are. */
export async function searchTransitStops(query: string, near?: { latitude: number; longitude: number } | null): Promise<SearchPlace[]> {
  const { data } = await searchTransitStopsCallable({ query, ...(near ? { near: { lat: near.latitude, lng: near.longitude } } : {}) });
  return data.stops.map((stop) => ({
    id: `stop:${stop.id}`,
    title: stop.name,
    subtitle: stop.agencyLabel,
    location: { latitude: stop.location.lat, longitude: stop.location.lng },
    kind: stop.mode,
    routes: stop.routes,
    agency: stop.agencyLabel,
    source: 'pathly' as const,
  }));
}

const TRANSIT_KINDS: ReadonlySet<PlaceKind | undefined> = new Set(['subway', 'rail', 'bus', 'ferry']);

/**
 * Pathly's stops first (at most 3), then Google's suggestions in Google's order, leaving out a
 * Google station that a listed stop already covers (the same name, or one starting with it).
 */
export function mergeSearchResults(stops: readonly SearchPlace[], places: readonly SearchPlace[]): SearchPlace[] {
  const shown = stops.slice(0, 3);
  const names = shown.map((stop) => normalizeStopName(stop.title));
  const isDuplicate = (place: SearchPlace) => {
    if (!TRANSIT_KINDS.has(place.kind)) return false;
    const name = normalizeStopName(place.title);
    return names.some((stopName) => name === stopName || name.startsWith(`${stopName} `) || stopName.startsWith(`${name} `));
  };
  return [...shown, ...places.filter((place) => !isDuplicate(place))];
}
