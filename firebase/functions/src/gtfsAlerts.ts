import { logger } from 'firebase-functions';

import { agencyConfig, type AgencyId } from './gtfsAgencies';
import { fetchFeedEntities } from './gtfsRealtime';

/**
 * Service alerts (delays, detours, suspensions, planned work) for one route. MTA agencies (subway
 * with the Staten Island Railway, city buses, LIRR) read the MTA's alerts feed, in its JSON form
 * because only that carries the MTA's own alert type ("Planned - Detour", "Delays"). Other
 * agencies with a feed of their own (NICE, Suffolk, NYC Ferry) read standard GTFS-RT alerts. A
 * failed fetch means no alerts, never a failed route: alerts are extra to the departures.
 */
export const MTA_ALERTS_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts.json';

/** What an alert is about, which decides its label and whether it reads as a warning. */
export type AlertKind = 'delays' | 'detour' | 'suspended' | 'change' | 'extra' | 'notice';

export type RouteAlert = {
  id: string;
  header: string;
  description: string | null;
  kind: AlertKind;
  /** A short label for the route's alert pill: "Detour in effect", "Upcoming service change". */
  label: string;
  /** Disrupts service now: shown in warning yellow. Upcoming changes and notices are neutral. */
  warning: boolean;
  /** Starts later (within UPCOMING_DAYS), rather than in effect now. */
  upcoming: boolean;
};

/**
 * A line's alert with what decides whether it touches one ride (tripLive.ts): when it runs, and
 * the stops it names on the line (empty: the whole line). Never sent to the app as is.
 */
export type LineAlert = RouteAlert & { periods: readonly Period[]; stopIds: readonly string[]; mtaType: string | null };

/** Planned work starting within this many days is listed as upcoming. */
const UPCOMING_DAYS = 7;
/** Alerts change slowly; this keeps rate-limited providers (Swiftly) from paying per poll. */
const ALERTS_CACHE_TTL_MS = 120_000;

type Period = { start: number; end: number };
type ParsedAlert = { id: string; header: string; description: string | null; periods: Period[]; routes: { agencyId: string | null; routeId: string | null; stopId: string | null }[]; mtaType: string | null; effect: number | null };

/** Now, upcoming (starts within UPCOMING_DAYS), or neither. */
function timing(periods: readonly Period[], nowSeconds: number): 'now' | 'upcoming' | null {
  if (periods.length === 0) return 'now';
  if (periods.some((period) => period.start <= nowSeconds && (period.end === 0 || nowSeconds <= period.end))) return 'now';
  const soonest = Math.min(...periods.map((period) => period.start).filter((start) => start > nowSeconds));
  return Number.isFinite(soonest) && soonest - nowSeconds <= UPCOMING_DAYS * 86_400 ? 'upcoming' : null;
}

/** GTFS-RT's Alert.Effect values this reads. */
const GTFS_EFFECT = { NO_SERVICE: 1, REDUCED_SERVICE: 2, SIGNIFICANT_DELAYS: 3, DETOUR: 4, ADDITIONAL_SERVICE: 5, MODIFIED_SERVICE: 6, STOP_MOVED: 9 } as const;

/** The MTA's alert type ("Planned - Part Suspended"), or the standard effect, or the header's words. */
export function alertKind(mtaType: string | null, effect: number | null, header: string): AlertKind {
  const type = (mtaType ?? '').toLowerCase();
  if (type) {
    if (type.includes('delay')) return 'delays';
    if (type.includes('detour') || type.includes('reroute')) return 'detour';
    if (type.includes('suspend')) return 'suspended';
    if (type.includes('extra service')) return 'extra';
    if (type.includes('notice')) return 'notice';
    return 'change';
  }
  switch (effect) {
    case GTFS_EFFECT.NO_SERVICE: return 'suspended';
    case GTFS_EFFECT.SIGNIFICANT_DELAYS: return 'delays';
    case GTFS_EFFECT.DETOUR: return 'detour';
    case GTFS_EFFECT.ADDITIONAL_SERVICE: return 'extra';
    case GTFS_EFFECT.REDUCED_SERVICE:
    case GTFS_EFFECT.MODIFIED_SERVICE:
    case GTFS_EFFECT.STOP_MOVED: return 'change';
    default: break;
  }
  const words = header.toLowerCase();
  if (/\bdetour/.test(words)) return 'detour';
  if (/\bdelay/.test(words)) return 'delays';
  if (/suspend|no service/.test(words)) return 'suspended';
  return 'notice';
}

const NOW_LABELS: Record<AlertKind, string> = {
  delays: 'Delays',
  detour: 'Detour in effect',
  suspended: 'Service suspended',
  change: 'Service change in effect',
  extra: 'Extra service',
  notice: 'Service notice',
};

/** The MTA's more specific types, without "Planned - ", for alerts in effect now. */
const MTA_TYPE_LABELS: Record<string, string> = {
  'stops skipped': 'Stops skipped',
  'express to local': 'Running local',
  'part suspended': 'Part of the line suspended',
  suspended: 'Service suspended',
  'boarding change': 'Boarding change',
  'extra transfer': 'Extra transfer needed',
  'substitute buses': 'Shuttle buses replace service',
  'reduced service': 'Reduced service',
  'special schedule': 'Special schedule',
  'station notice': 'Station notice',
  reroute: 'Reroute in effect',
};

/** The pill label for an alert, and whether it's a warning. */
export function alertLabel(kind: AlertKind, upcoming: boolean, mtaType: string | null): { label: string; warning: boolean } {
  if (upcoming) {
    return { label: kind === 'extra' ? 'Upcoming extra service' : kind === 'notice' ? 'Upcoming notice' : 'Upcoming service change', warning: false };
  }
  const warning = kind !== 'extra' && kind !== 'notice';
  const specific = MTA_TYPE_LABELS[(mtaType ?? '').replace(/^planned\s*-\s*/i, '').trim().toLowerCase()];
  return { label: specific ?? NOW_LABELS[kind], warning };
}

type JsonText = { translation?: { text?: string; language?: string }[] } | undefined;
type JsonAlertEntity = {
  id: string;
  alert?: {
    active_period?: { start?: number; end?: number }[];
    informed_entity?: { agency_id?: string; route_id?: string; stop_id?: string }[];
    header_text?: JsonText;
    description_text?: JsonText;
    'transit_realtime.mercury_alert'?: { alert_type?: string };
  };
};

/** Plain English text of a translated string (the feeds also carry an HTML copy). */
function englishText(text: { translation?: { text?: string | null; language?: string | null }[] | null } | null | undefined): string | null {
  const translations = text?.translation ?? [];
  const plain = translations.find((translation) => translation.language === 'en')
    ?? translations.find((translation) => !translation.language?.includes('html'));
  const value = plain?.text?.trim();
  return value ? value : null;
}

const alertsCache = new Map<string, { expiresAt: number; promise: Promise<ParsedAlert[]> }>();

function cached(key: string, load: () => Promise<ParsedAlert[]>): Promise<ParsedAlert[]> {
  const hit = alertsCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const promise = load();
  alertsCache.set(key, { expiresAt: Date.now() + ALERTS_CACHE_TTL_MS, promise });
  void promise.catch(() => alertsCache.delete(key));
  return promise;
}

/** Clears cached feeds (tests). */
export function resetAlertsCacheForTests() {
  alertsCache.clear();
}

function loadMtaAlerts(): Promise<ParsedAlert[]> {
  return cached(MTA_ALERTS_FEED_URL, async () => {
    const response = await fetch(MTA_ALERTS_FEED_URL, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`MTA alerts request failed: ${response.status}`);
    const body = (await response.json()) as { entity?: JsonAlertEntity[] };
    return (body.entity ?? []).flatMap((entity): ParsedAlert[] => {
      const alert = entity.alert;
      const header = englishText(alert?.header_text);
      if (!alert || !header) return [];
      return [{
        id: entity.id,
        header,
        description: englishText(alert.description_text),
        periods: (alert.active_period ?? []).map((period) => ({ start: Number(period.start ?? 0), end: Number(period.end ?? 0) })),
        routes: (alert.informed_entity ?? []).map((informed) => ({ agencyId: informed.agency_id ?? null, routeId: informed.route_id ?? null, stopId: informed.stop_id ?? null })),
        mtaType: alert['transit_realtime.mercury_alert']?.alert_type ?? null,
        effect: null,
      }];
    });
  });
}

function loadAgencyAlerts(agencyId: AgencyId): Promise<ParsedAlert[]> {
  const requests = agencyConfig(agencyId).alertFeedRequests?.() ?? [];
  return cached(`agency:${agencyId}`, async () => {
    let lastError: unknown = null;
    for (const request of requests) {
      try {
        const entities = await fetchFeedEntities(request.url, request.headers);
        return entities.flatMap((entity): ParsedAlert[] => {
          const alert = entity.alert;
          const header = englishText(alert?.headerText);
          if (!alert || !header) return [];
          return [{
            id: entity.id,
            header,
            description: englishText(alert.descriptionText),
            periods: (alert.activePeriod ?? []).map((period) => ({ start: Number(period.start ?? 0), end: Number(period.end ?? 0) })),
            routes: (alert.informedEntity ?? []).map((informed) => ({ agencyId: informed.agencyId || null, routeId: informed.routeId || null, stopId: informed.stopId || null })),
            mtaType: null,
            effect: alert.effect ?? null,
          }];
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('No alerts feed');
  });
}

/** Alerts in effect now or starting soon that name this route: warnings first, then the rest, upcoming last. */
export async function getRouteAlerts(agencyId: AgencyId, routeId: string, nowMs = Date.now()): Promise<RouteAlert[]> {
  return (await getLineAlerts(agencyId, routeId, nowMs)).map(({ periods: _periods, stopIds: _stopIds, mtaType: _mtaType, ...alert }) => alert);
}

/** getRouteAlerts with each alert's periods and stops, for judging which rides it touches. */
export async function getLineAlerts(agencyId: AgencyId, routeId: string, nowMs = Date.now()): Promise<LineAlert[]> {
  const config = agencyConfig(agencyId);
  const mtaAgencies = config.serviceAlertAgencyIds ?? [];
  const ownFeed = config.alertFeedRequests != null;
  if (mtaAgencies.length === 0 && !ownFeed) return [];

  let parsed: ParsedAlert[];
  try {
    parsed = mtaAgencies.length > 0 ? await loadMtaAlerts() : await loadAgencyAlerts(agencyId);
  } catch (error) {
    logger.warn('Could not load service alerts', {
      agencyId,
      event: 'gtfs_alerts_failed',
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const nowSeconds = nowMs / 1000;
  const alerts: LineAlert[] = [];
  const seen = new Set<string>();
  for (const alert of parsed) {
    if (seen.has(alert.id)) continue;
    // MTA's feed covers several agencies, so its route_ids are matched with the agency (Metro-North's
    // line "A" isn't the A train). An agency's own feed names its routes, or the whole agency when
    // an entry has no route or stop (a holiday schedule).
    const forRoute = mtaAgencies.length > 0
      ? alert.routes.some((informed) => informed.routeId === routeId && mtaAgencies.includes(informed.agencyId ?? ''))
      : alert.routes.some((informed) => informed.routeId === routeId || (!informed.routeId && !informed.stopId));
    if (!forRoute) continue;
    const when = timing(alert.periods, nowSeconds);
    if (!when) continue;
    seen.add(alert.id);
    const upcoming = when === 'upcoming';
    const kind = alertKind(alert.mtaType, alert.effect, alert.header);
    const stopIds = alert.routes.flatMap((informed) => (informed.stopId && (mtaAgencies.length === 0 || mtaAgencies.includes(informed.agencyId ?? '')) ? [informed.stopId] : []));
    alerts.push({ id: alert.id, header: alert.header, description: alert.description, kind, upcoming, ...alertLabel(kind, upcoming, alert.mtaType), periods: alert.periods, stopIds, mtaType: alert.mtaType });
  }
  const rank = (alert: RouteAlert) => (alert.warning ? 0 : alert.upcoming ? 2 : 1);
  return alerts.map((alert, index) => ({ alert, index })).sort((a, b) => rank(a.alert) - rank(b.alert) || a.index - b.index).map(({ alert }) => alert);
}
