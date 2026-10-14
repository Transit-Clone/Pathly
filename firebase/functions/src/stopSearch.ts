import { haversineMeters } from './geo';
import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { loadAgencyStaticData, loadGlobalStopRouteIndex, type GtfsRoute } from './gtfsStaticData';

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
  mode: 'subway' | 'bus' | 'rail';
  location: { lat: number; lng: number };
  routes: { shortName: string; color: string }[];
};

type IndexedStop = StopSuggestion & { normalized: string; tokens: string[] };

const MAX_RESULTS = 4;
const MERGE_RADIUS_METERS = 150;
const MIN_QUERY_LENGTH = 2;

const AGENCY_MODES: Record<AgencyId, StopSuggestion['mode']> = { lirr: 'rail', subway: 'subway', nice: 'bus', suffolk: 'bus' };

const WORD_FORMS: Record<string, string> = { street: 'st', avenue: 'av', ave: 'av', road: 'rd', boulevard: 'blvd', place: 'pl', parkway: 'pkwy', square: 'sq', station: 'sta' };

/** Lowercase, "&" as "and", punctuation dropped, and common street words in one form ("ave" = "avenue"). */
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
    const match = nearby.find((entry) => haversineMeters(entry.lat, entry.lon, station.lat, station.lon) <= MERGE_RADIUS_METERS);
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
      .map((route) => ({ shortName: routeLabel(route), color: route.color ? `#${route.color.replace(/^#/, '')}` : '#0B4F9C' }));
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

/** Every agency's searchable stops, built once per instance on first use. */
function stopIndex(): Promise<IndexedStop[]> {
  indexPromise ??= (async () => {
    const all: IndexedStop[] = [];
    for (const agencyId of Object.keys(AGENCY_CONFIGS) as AgencyId[]) {
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

/** Unit-test isolation only. */
export function resetStopSearchForTests(): void {
  indexPromise = undefined;
}
