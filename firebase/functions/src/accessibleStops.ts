import type { AgencyId } from './gtfsAgencies';
import { loadAgencyStaticData } from './gtfsStaticData';

/**
 * Which of an agency's stops a wheelchair user can board at. `everyStop`: the whole agency is
 * step-free (every fixed-route bus kneels or carries a ramp or lift, and every ferry boards level),
 * so its stops aren't listed.
 */
export type AccessibleStops = { everyStop: boolean; stopIds: string[] };

/**
 * NY Open Data's "MTA Subway Stations": the subway's own GTFS has no wheelchair_boarding, so ADA
 * status comes from here. `ada` is 0 none, 1 fully accessible, 2 partially (one direction only).
 */
const SUBWAY_STATIONS_URL = 'https://data.ny.gov/resource/39hk-dx4f.json?$select=gtfs_stop_id,ada,ada_northbound,ada_southbound&$limit=1000';
const SUBWAY_CACHE_MS = 24 * 60 * 60 * 1000;
const STEP_FREE_AGENCIES = new Set<AgencyId>(['nice', 'suffolk', 'bx', 'bk', 'mn', 'qn', 'si', 'busco', 'nycferry', 'siferry']);

type SubwayStationRow = { gtfs_stop_id?: string; ada?: string; ada_northbound?: string; ada_southbound?: string };

let subwayCache: { at: number; stopIds: string[] } | null = null;

/** Subway stations (and, where only one direction is, their "N"/"S" platforms) with step-free access. */
export function subwayAccessibleStopIds(rows: readonly SubwayStationRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const station = row.gtfs_stop_id?.trim();
    if (!station || !row.ada || row.ada === '0') continue;
    const north = row.ada === '1' || row.ada_northbound === '1';
    const south = row.ada === '1' || row.ada_southbound === '1';
    if (north && south) ids.add(station);
    if (north) ids.add(`${station}N`);
    if (south) ids.add(`${station}S`);
  }
  return [...ids].sort();
}

async function subwayStopIds(): Promise<string[]> {
  if (subwayCache && Date.now() - subwayCache.at < SUBWAY_CACHE_MS) return subwayCache.stopIds;
  try {
    const response = await fetch(SUBWAY_STATIONS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`subway stations ${response.status}`);
    const stopIds = subwayAccessibleStopIds((await response.json()) as SubwayStationRow[]);
    if (stopIds.length > 0) subwayCache = { at: Date.now(), stopIds };
    return stopIds;
  } catch {
    // Stale beats nothing: a station's elevator status changes rarely.
    return subwayCache?.stopIds ?? [];
  }
}

/** See AccessibleStops. Agencies whose GTFS carries wheelchair_boarding (LIRR) are read from it. */
export async function getAccessibleStops(agencyId: AgencyId): Promise<AccessibleStops> {
  if (STEP_FREE_AGENCIES.has(agencyId)) return { everyStop: true, stopIds: [] };
  if (agencyId === 'subway') return { everyStop: false, stopIds: await subwayStopIds() };
  const { stopsById } = loadAgencyStaticData(agencyId);
  const stopIds: string[] = [];
  for (const stop of stopsById.values()) {
    // A platform with no answer of its own takes its station's (GTFS wheelchair_boarding inheritance).
    const wheelchair = stop.wheelchair ?? (stop.parentStation ? stopsById.get(stop.parentStation)?.wheelchair : null);
    if (wheelchair) stopIds.push(stop.stopId);
  }
  return { everyStop: false, stopIds: stopIds.sort() };
}
