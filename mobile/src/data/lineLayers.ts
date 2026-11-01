import { callable } from '../lib/firebase';
import { readCache, writeCache } from './deviceCache';
import { fetchRouteGeometry } from './routeGeometry';
import type { LiveSource } from './transit';

type AgencyId = LiveSource['agencyId'];

/** The home map's "show every line" switches: one per agency the rider knows, not per feed. */
export const LINE_LAYER_GROUPS = [
  { id: 'subway', label: 'MTA Subway', icon: 'subway', agencies: ['subway'] },
  { id: 'bus', label: 'MTA Buses', icon: 'bus', agencies: ['bx', 'bk', 'mn', 'qn', 'si', 'busco'] },
  { id: 'lirr', label: 'LIRR', icon: 'rail', agencies: ['lirr'] },
  { id: 'ferry', label: 'NYC Ferries', icon: 'ferry', agencies: ['nycferry', 'siferry'] },
  { id: 'nice', label: 'NICE Buses', icon: 'bus', agencies: ['nice'] },
  { id: 'suffolk', label: 'Suffolk Buses', icon: 'bus', agencies: ['suffolk'] },
] as const satisfies readonly { id: string; label: string; icon: string; agencies: readonly AgencyId[] }[];

export type LineLayerGroupId = (typeof LINE_LAYER_GROUPS)[number]['id'];

/** One line switched on by itself, with what's needed to draw and name it. */
export type LineLayerRoute = { agencyId: AgencyId; routeId: string; shortName: string; color: string };

/** What the rider has switched on, kept on this device. */
export type LineLayerChoice = { groups: readonly LineLayerGroupId[]; routes: readonly LineLayerRoute[] };

export const EMPTY_LINE_LAYERS: LineLayerChoice = { groups: [], routes: [] };

/** One drawn line: its color and path. */
export type MapLine = { key: string; color: string; path: readonly { latitude: number; longitude: number }[] };

const CHOICE_KEY = 'pathly.lineLayers.v1';
// A choice is a preference, not a snapshot: it stays until the rider changes it.
const CHOICE_MAX_AGE_MS = Number.MAX_SAFE_INTEGER;

export async function readLineLayerChoice(): Promise<LineLayerChoice> {
  return (await readCache<LineLayerChoice>(CHOICE_KEY, CHOICE_MAX_AGE_MS)) ?? EMPTY_LINE_LAYERS;
}

export function writeLineLayerChoice(choice: LineLayerChoice): Promise<void> {
  return writeCache(CHOICE_KEY, choice);
}

export function lineLayerRouteKey(route: { agencyId: string; routeId: string }): string {
  return `${route.agencyId}:${route.routeId}`;
}

type AgencyLinesResponse = { lines: { routeId: string; shortName: string; color: string; path: [number, number][] }[] };
const getAgencyLinesCallable = callable<{ agencyId: AgencyId }, AgencyLinesResponse>('getAgencyLines');
const agencyLinesCache = new Map<AgencyId, Promise<MapLine[]>>();

function routeColor(color: string): string {
  const hex = color.replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : '#6B7280';
}

/** Every line of one agency, for a "show all" switch. Cached for the session; a failure isn't. */
export function fetchAgencyLines(agencyId: AgencyId): Promise<MapLine[]> {
  const cached = agencyLinesCache.get(agencyId);
  if (cached) return cached;
  const promise = getAgencyLinesCallable({ agencyId }).then(({ data }) => data.lines.map((line): MapLine => ({
    key: lineLayerRouteKey({ agencyId, routeId: line.routeId }),
    color: routeColor(line.color),
    path: line.path.map(([latitude, longitude]) => ({ latitude, longitude })),
  })));
  agencyLinesCache.set(agencyId, promise);
  promise.catch(() => agencyLinesCache.delete(agencyId));
  return promise;
}

/** One line switched on by itself: its direction-0 path from route geometry (else direction 1). */
export async function fetchRouteLine(route: LineLayerRoute): Promise<MapLine | null> {
  const source = { agencyId: route.agencyId, routeId: route.routeId } as LiveSource;
  const geometry = (await fetchRouteGeometry(source, 0)) ?? (await fetchRouteGeometry(source, 1));
  const points = geometry?.path ?? geometry?.stops ?? [];
  if (points.length < 2) return null;
  return {
    key: lineLayerRouteKey(route),
    color: routeColor(route.color),
    path: points.map((point) => ({ latitude: point.lat, longitude: point.lon })),
  };
}

/** The lines to draw for a choice: each switched-on group's agencies, then single lines not already drawn. */
export async function loadMapLines(choice: LineLayerChoice): Promise<MapLine[]> {
  const agencies = LINE_LAYER_GROUPS.filter((group) => choice.groups.includes(group.id)).flatMap((group) => group.agencies);
  const groupLines = (await Promise.all(agencies.map((agencyId) => fetchAgencyLines(agencyId).catch(() => [])))).flat();
  const drawn = new Set(groupLines.map((line) => line.key));
  const single = await Promise.all(choice.routes.filter((route) => !drawn.has(lineLayerRouteKey(route))).map((route) => fetchRouteLine(route).catch(() => null)));
  return [...groupLines, ...single.filter((line): line is MapLine => line !== null)];
}
