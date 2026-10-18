import { haversineMeters } from './geo';
import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { availableAgencyIds, loadAgencyStaticData, loadGlobalStopRouteIndex, type GtfsRoute } from './gtfsStaticData';
import { displayRouteColor } from './routeColors';

/**
 * Searching Pathly's own transit stops by name, so search can show stations and bus stops with
 * the lines that serve them (Google's place suggestions know a place is a station, not which lines
 * stop there). One entry per station: a subway or LIRR station's platforms share their parent
 * station, and a bus stop's two directions (separate stop_ids) are merged by name and distance.
 */

export type StopSuggestion = {
  id: string;
  name: string;
  agencyLabel: string;
  mode: 'subway' | 'bus' | 'rail' | 'ferry';
  location: { lat: number; lng: number };
  routes: { shortName: string; color: string }[];
};

type IndexedStop = StopSuggestion & { normalized: string; tokens: string[] };

const MAX_RESULTS = 4;
const MERGE_RADIUS_METERS = 150;
const COMPLEX_RADIUS_METERS = 300;
const MIN_QUERY_LENGTH = 2;

const AGENCY_MODES: Record<AgencyId, StopSuggestion['mode']> = {
  lirr: 'rail', subway: 'subway', nice: 'bus', suffolk: 'bus',
  bx: 'bus', bk: 'bus', mn: 'bus', qn: 'bus', si: 'bus', busco: 'bus',
  nycferry: 'ferry',
};

const WORD_FORMS: Record<string, string> = { street: 'st', avenue: 'av', ave: 'av', road: 'rd', boulevard: 'blvd', place: 'pl', parkway: 'pkwy', square: 'sq', station: 'sta' };

/** Lowercase, "&" as "and", punctuation dropped, common street words in one form ("ave" = "avenue"), and ordinals as numbers ("42nd" = "42"). */
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

const routeOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const routeLabel = (route: GtfsRoute) => route.shortName || route.name;

function buildAgencyIndex(agencyId: AgencyId, routeIndex: Map<string, Set<string>>): IndexedStop[] {
  const { routesById, stopsById } = loadAgencyStaticData(agencyId);
  // Platforms group under their parent station; other stops stand alone for now.
  const groups = new Map<string, string[]>();
  for (const stop of stopsById.values()) {
    if (!routeIndex.has(stop.stopId)) continue;
    const key = stop.parentStation ?? stop.stopId;
    const group = groups.get(key);
    if (group) group.push(stop.stopId);
    else groups.set(key, [stop.stopId]);
  }
  // Then groups with the same name close together merge: a bus stop's two directions, or a
  // station complex published as one parent per line group (Times Sq-42 St).
  const members = new Map<string, string[]>();
  const byName = new Map<string, { key: string; lat: number; lon: number }[]>();
  for (const [key, stopIds] of groups) {
    const station = stopsById.get(key) ?? stopsById.get(stopIds[0]!)!;
    const name = normalizeStopName(station.name);
    const nearby = byName.get(name) ?? [];
    // Stations (platforms under a parent) can sit farther apart in one complex than a bus stop's two sides.
    const radius = stopsById.get(key)?.stopId === stopIds[0] && stopIds.length === 1 ? MERGE_RADIUS_METERS : COMPLEX_RADIUS_METERS;
    const match = nearby.find((entry) => haversineMeters(entry.lat, entry.lon, station.lat, station.lon) <= radius);
    if (match) {
      members.get(match.key)!.push(...stopIds);
    } else {
      members.set(key, [...stopIds]);
      nearby.push({ key, lat: station.lat, lon: station.lon });
      byName.set(name, nearby);
    }
  }

  const config = AGENCY_CONFIGS[agencyId];
  const entries: IndexedStop[] = [];
  for (const [key, stopIds] of members) {
    const station = stopsById.get(key) ?? stopsById.get(stopIds[0]!)!;
    const routeIds = new Set(stopIds.flatMap((stopId) => [...(routeIndex.get(stopId) ?? [])]));
    const routes = [...routeIds]
      .map((routeId) => routesById.get(routeId))
      .filter((route): route is GtfsRoute => route !== undefined)
      .sort((a, b) => routeOrder.compare(routeLabel(a), routeLabel(b)))
      .map((route) => ({ shortName: routeLabel(route), color: displayRouteColor(agencyId, route) }));
    if (routes.length === 0) continue;
    const lat = stopIds.reduce((sum, stopId) => sum + stopsById.get(stopId)!.lat, 0) / stopIds.length;
    const lng = stopIds.reduce((sum, stopId) => sum + stopsById.get(stopId)!.lon, 0) / stopIds.length;
    const normalized = normalizeStopName(station.name);
    entries.push({
      id: `${agencyId}:${key}`,
      name: station.name,
      agencyLabel: config.displayName,
      mode: AGENCY_MODES[agencyId],
      location: { lat, lng },
      routes,
      normalized,
      tokens: normalized.split(' '),
    });
  }
  return entries;
}

let indexPromise: Promise<IndexedStop[]> | undefined;
let indexedAgencies = '';

/** Every readable agency's searchable stops, built on first use and again when that set changes. */
function stopIndex(): Promise<IndexedStop[]> {
  const agencies = availableAgencyIds();
  if (agencies.join(',') !== indexedAgencies) {
    indexPromise = undefined;
    indexedAgencies = agencies.join(',');
  }
  indexPromise ??= (async () => {
    const all: IndexedStop[] = [];
    for (const agencyId of agencies) {
      all.push(...buildAgencyIndex(agencyId, await loadGlobalStopRouteIndex(agencyId)));
    }
    return all;
  })();
  indexPromise.catch(() => {
    indexPromise = undefined;
  });
  return indexPromise;
}

/**
 * 5: the whole name; 4: the name's first words ("jamaica" in "jamaica 179 st"); 3: the start of the
 * name ("penn" in "pennsylvania av"); 2: every query word starts a name word; 1: anywhere; 0: none.
 */
function matchScore(entry: IndexedStop, query: string, queryTokens: readonly string[]): number {
  if (entry.normalized === query) return 5;
  if (entry.normalized.startsWith(`${query} `)) return 4;
  if (entry.normalized.startsWith(query)) return 3;
  if (queryTokens.every((token) => entry.tokens.some((word) => word.startsWith(token)))) return 2;
  if (entry.normalized.includes(query)) return 1;
  return 0;
}

/** The best-matching stops for `query`, nearest first among equally good matches when `near` is known. */
export async function searchStops(query: string, near?: { lat: number; lng: number }): Promise<StopSuggestion[]> {
  const normalized = normalizeStopName(query);
  if (normalized.length < MIN_QUERY_LENGTH) return [];
  const tokens = normalized.split(' ');
  const scored = (await stopIndex()).flatMap((entry) => {
    const score = matchScore(entry, normalized, tokens);
    if (score === 0) return [];
    const meters = near ? haversineMeters(near.lat, near.lng, entry.location.lat, entry.location.lng) : 0;
    return [{ entry, score, meters }];
  });
  scored.sort((a, b) => b.score - a.score || a.meters - b.meters || a.entry.name.length - b.entry.name.length);
  return scored.slice(0, MAX_RESULTS).map(({ entry: { normalized: _normalized, tokens: _tokens, ...suggestion } }) => suggestion);
}

/** A Google station suggestion to find in Pathly's stops: its name and the mode Google gave it. */
export type StationLookup = { name: string; kind: 'subway' | 'rail' | 'bus' | 'ferry' };

// Google often names a station with a suffix the timetables don't ("Jamaica Station", "Penn Station LIRR").
const STATION_SUFFIXES = /( (sta|terminal|lirr|subway|bus|stop|rr))+$/;
const comparable = (name: string) => normalizeStopName(name).replace(STATION_SUFFIXES, '');

/**
 * Each Google station suggestion's Pathly stop, or null: a stop of the same mode whose name is the
 * same once station words are set aside, or where one name begins with the other ("Jamaica" for
 * "Jamaica Station"). Nearest to `near` when several fit. Gives Google's own station rows their lines.
 */
export async function lookupStations(stations: readonly StationLookup[], near?: { lat: number; lng: number }): Promise<(StopSuggestion | null)[]> {
  const index = await stopIndex();
  return stations.map(({ name, kind }) => {
    const wanted = comparable(name);
    if (wanted.length < MIN_QUERY_LENGTH) return null;
    const matches = index.filter((entry) => {
      if (entry.mode !== kind && !(kind === 'rail' && entry.mode === 'subway')) return false;
      const candidate = comparable(entry.name);
      return candidate === wanted || candidate.startsWith(`${wanted} `) || wanted.startsWith(`${candidate} `);
    });
    if (matches.length === 0) return null;
    const exact = matches.filter((entry) => comparable(entry.name) === wanted);
    const pool = exact.length > 0 ? exact : matches;
    const meters = (entry: IndexedStop) => (near ? haversineMeters(near.lat, near.lng, entry.location.lat, entry.location.lng) : 0);
    const { normalized: _normalized, tokens: _tokens, ...best } = [...pool].sort((a, b) => meters(a) - meters(b))[0]!;
    // A station complex can be several timetable stations side by side (Grand Central's 4/5/6, 7,
    // and shuttle): Google's one station gets all their lines.
    const sameComplex = matches.filter((entry) => entry.mode === best.mode
      && haversineMeters(entry.location.lat, entry.location.lng, best.location.lat, best.location.lng) <= COMPLEX_RADIUS_METERS);
    const routes = new Map(best.routes.map((route) => [route.shortName, route]));
    for (const entry of sameComplex) for (const route of entry.routes) if (!routes.has(route.shortName)) routes.set(route.shortName, route);
    return { ...best, routes: [...routes.values()].sort((a, b) => routeOrder.compare(a.shortName, b.shortName)) };
  });
}

/** Unit-test isolation only. */
export function resetStopSearchForTests(): void {
  indexPromise = undefined;
  indexedAgencies = '';
}
