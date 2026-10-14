import { callable } from '../lib/firebase';
import type { PlaceKind, SearchPlace, StopRoute } from './placesSearch';

/** Mirrors firebase/functions/src/stopSearch.ts's StopSuggestion. */
type StopSuggestion = {
  id: string;
  name: string;
  agencyLabel: string;
  mode: Exclude<PlaceKind, 'place'>;
  location: { lat: number; lng: number };
  routes: StopRoute[];
};

const WORD_FORMS: Record<string, string> = { street: 'st', avenue: 'av', ave: 'av', road: 'rd', boulevard: 'blvd', place: 'pl', parkway: 'pkwy', square: 'sq', station: 'sta' };

/** Same as the backend's normalizeStopName ("42nd Street" = "42 st"): compares names and queries. */
export function normalizeStopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => WORD_FORMS[word] ?? word.replace(/^(\d+)(st|nd|rd|th)$/, '$1'))
    .join(' ');
}

type StationLookup = { name: string; kind: Exclude<PlaceKind, 'place'> };
type SearchTransitStopsRequest = { query?: string; stations?: StationLookup[]; near?: { lat: number; lng: number } };
type SearchTransitStopsResponse = { stops?: StopSuggestion[]; stations?: (StopSuggestion | null)[] };

const searchTransitStopsCallable = callable<SearchTransitStopsRequest, SearchTransitStopsResponse>(
  'searchTransitStops',
  ({ stops, stations }) => ({ names: (stops ?? stations ?? []).map((stop) => stop?.name ?? null) }),
);

const nearPoint = (near?: { latitude: number; longitude: number } | null) => (near ? { near: { lat: near.latitude, lng: near.longitude } } : {});

/** What a stop is, in words: "LIRR station", "Subway station", "Bus stop · NICE Bus", or "Ferry landing · NYC Ferry". */
export function stopKindLabel(mode: StopSuggestion['mode'], agencyLabel: string): string {
  if (mode === 'subway') return 'Subway station';
  if (mode === 'bus') return `Bus stop · ${agencyLabel}`;
  if (mode === 'ferry') return `Ferry landing · ${agencyLabel}`;
  return `${agencyLabel} station`;
}

/** Pathly's own stops matching `query`, as search places that already know where they are. */
export async function searchTransitStops(query: string, near?: { latitude: number; longitude: number } | null): Promise<SearchPlace[]> {
  const { data } = await searchTransitStopsCallable({ query, ...nearPoint(near) });
  return (data.stops ?? []).map((stop) => ({
    id: `stop:${stop.id}`,
    title: stop.name,
    subtitle: stopKindLabel(stop.mode, stop.agencyLabel),
    location: { latitude: stop.location.lat, longitude: stop.location.lng },
    kind: stop.mode,
    routes: stop.routes,
    agency: stop.agencyLabel,
    source: 'pathly' as const,
  }));
}

const TRANSIT_KINDS: ReadonlySet<PlaceKind | undefined> = new Set(['subway', 'rail', 'bus', 'ferry']);

/** A Google suggestion for a station or stop, which can be given its lines. */
export const isTransitPlace = (place: SearchPlace) => TRANSIT_KINDS.has(place.kind);

/**
 * Google's own station suggestions with their lines from Pathly's stops: each gets the routes and
 * agency of the matching stop, and keeps Google's id and address (it's still resolved through Google).
 */
export async function addStationLines(places: readonly SearchPlace[], near?: { latitude: number; longitude: number } | null): Promise<Map<string, Pick<SearchPlace, 'routes' | 'agency'>>> {
  const stations = places.filter((place) => isTransitPlace(place) && !place.routes?.length).slice(0, 8);
  if (stations.length === 0) return new Map();
  const { data } = await searchTransitStopsCallable({
    stations: stations.map((place) => ({ name: place.title, kind: place.kind as StationLookup['kind'] })),
    ...nearPoint(near),
  });
  const lines = new Map<string, Pick<SearchPlace, 'routes' | 'agency'>>();
  (data.stations ?? []).forEach((stop, index) => {
    if (stop) lines.set(stations[index]!.id, { routes: stop.routes, agency: stop.agencyLabel });
  });
  return lines;
}

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
