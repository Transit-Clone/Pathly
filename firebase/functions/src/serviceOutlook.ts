import { logger } from 'firebase-functions';

import type { AgencyId } from './gtfsAgencies';
import { isServiceRunningOn, loadAgencyStaticData } from './gtfsStaticData';

/**
 * Winter weather that may slow service, from the National Weather Service's active alerts for New
 * York City and Long Island. Forecasts a week out aren't reliable enough to warn riders with, so
 * this leads by as long as the NWS's own watches and warnings do (usually one to three days). A
 * failed fetch means nothing to show, never a failed request.
 */
const NWS_POINTS = ['40.75,-73.98', '40.79,-73.20'] as const;
const NWS_USER_AGENT = 'Pathly transit app (https://github.com/Transit-Clone/Pathly)';
const CACHE_TTL_MS = 15 * 60 * 1000;
const WINTER_EVENT = /winter storm|blizzard|ice storm|snow squall|winter weather|lake effect snow/i;

export type WinterAlert = { id: string; event: string; headline: string; onset: string | null };

type NwsResponse = { features?: { id?: string; properties?: { event?: string; headline?: string | null; onset?: string | null } }[] };

/** The winter alerts among NWS features, once each. */
export function winterAlerts(responses: readonly NwsResponse[]): WinterAlert[] {
  const seen = new Map<string, WinterAlert>();
  for (const response of responses) {
    for (const feature of response.features ?? []) {
      const event = feature.properties?.event;
      if (!feature.id || !event || !WINTER_EVENT.test(event) || seen.has(feature.id)) continue;
      seen.set(feature.id, { id: feature.id, event, headline: feature.properties?.headline || event, onset: feature.properties?.onset ?? null });
    }
  }
  return [...seen.values()];
}

/**
 * What an agency's own timetable says about one route on a holiday, against the same weekday a
 * week earlier. `unknown` when the timetable can't say: it doesn't reach that far yet, or (for
 * `regular`) the agency publishes no changes for that date, so matching the usual week proves nothing.
 */
export type HolidayService = { status: 'none' | 'reduced' | 'regular' | 'unknown'; percentFewer?: number };

/** Below this share of the usual trips, a route counts as reduced rather than regular. */
const REDUCED_BELOW = 0.9;

function datePartsOf(dateKey: string): { key: string; dayOfWeek: number; earlierKey: string } {
  const day = Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(4, 6)) - 1, Number(dateKey.slice(6, 8)));
  const earlier = new Date(day - 7 * 86_400_000).toISOString();
  return { key: dateKey, dayOfWeek: new Date(day).getUTCDay(), earlierKey: earlier.slice(0, 10).replaceAll('-', '') };
}

export function holidayService(agencyId: AgencyId, routeId: string, dateKey: string): HolidayService {
  const { calendarExceptionsByService, tripsById } = loadAgencyStaticData(agencyId);
  const { dayOfWeek, earlierKey } = datePartsOf(dateKey);
  const runningOn = new Map<string, boolean>();
  const runs = (serviceId: string, key: string) => {
    const cacheKey = `${key}|${serviceId}`;
    let running = runningOn.get(cacheKey);
    if (running === undefined) {
      running = isServiceRunningOn(agencyId, serviceId, key, dayOfWeek);
      runningOn.set(cacheKey, running);
    }
    return running;
  };
  let holidayTrips = 0;
  let usualTrips = 0;
  let agencyRunsThatDay = false;
  for (const trip of tripsById.values()) {
    const running = runs(trip.serviceId, dateKey);
    agencyRunsThatDay ||= running;
    if (trip.routeId !== routeId) continue;
    if (running) holidayTrips += 1;
    if (runs(trip.serviceId, earlierKey)) usualTrips += 1;
  }
  if (!agencyRunsThatDay || usualTrips === 0) return { status: 'unknown' };
  if (holidayTrips === 0) return { status: 'none' };
  if (holidayTrips < usualTrips * REDUCED_BELOW) return { status: 'reduced', percentFewer: Math.round((1 - holidayTrips / usualTrips) * 100) };
  const publishesChanges = [...calendarExceptionsByService.values()].some((dates) => dates.has(dateKey));
  return { status: publishesChanges ? 'regular' : 'unknown' };
}

let cache: { expiresAt: number; alerts: Promise<WinterAlert[]> } | null = null;

/** Clears the cached alerts (tests). */
export function resetServiceOutlookCacheForTests() {
  cache = null;
}

async function loadWinterAlerts(): Promise<WinterAlert[]> {
  const responses = await Promise.all(NWS_POINTS.map(async (point) => {
    const response = await fetch(`https://api.weather.gov/alerts/active?point=${point}`, {
      headers: { accept: 'application/geo+json', 'user-agent': NWS_USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`NWS alerts request failed: ${response.status}`);
    return (await response.json()) as NwsResponse;
  }));
  return winterAlerts(responses);
}

export async function getWinterAlerts(nowMs = Date.now()): Promise<WinterAlert[]> {
  if (cache && cache.expiresAt > nowMs) return cache.alerts;
  const alerts = loadWinterAlerts().catch((error: unknown) => {
    logger.warn('Could not load winter weather alerts', { reason: error instanceof Error ? error.message : String(error) });
    cache = null;
    return [];
  });
  cache = { expiresAt: nowMs + CACHE_TTL_MS, alerts };
  return alerts;
}
