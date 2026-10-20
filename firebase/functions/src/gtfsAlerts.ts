import { logger } from 'firebase-functions';
import type { transit_realtime } from 'gtfs-realtime-bindings';

import { agencyConfig, type AgencyId } from './gtfsAgencies';
import { fetchFeedEntities } from './gtfsRealtime';

/**
 * MTA's service alerts (delays, reroutes, suspensions, planned work) for one route, from the MTA's
 * public GTFS-RT alerts feed. It covers the subway (agency_id MTASBWY, including the Staten Island
 * Railway), city buses (MTA NYCT, MTABC) and the LIRR (LI), each by the same route_ids as their
 * timetables; agencies it doesn't cover have no serviceAlertAgencyIds and get none. A failed fetch
 * means no alerts, never a failed route: alerts are extra to the departures.
 */
export const MTA_ALERTS_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts';

export type RouteAlert = { id: string; header: string; description: string | null };

/** Plain English text of a translated string (the feed also carries an HTML copy). */
function englishText(text: transit_realtime.TranslatedString | null | undefined): string | null {
  const translations = text?.translation ?? [];
  const plain = translations.find((translation) => translation.language === 'en')
    ?? translations.find((translation) => !translation.language?.includes('html'));
  const value = plain?.text?.trim();
  return value ? value : null;
}

function isActive(alert: transit_realtime.Alert, nowSeconds: number): boolean {
  const periods = alert.activePeriod ?? [];
  if (periods.length === 0) return true;
  return periods.some((period) => {
    const start = period.start != null ? Number(period.start) : 0;
    const end = period.end != null ? Number(period.end) : 0;
    return start <= nowSeconds && (end === 0 || nowSeconds <= end);
  });
}

/** Alerts in effect now that name this route, in feed order. */
export async function getRouteAlerts(agencyId: AgencyId, routeId: string, nowMs = Date.now()): Promise<RouteAlert[]> {
  const alertAgencies = agencyConfig(agencyId).serviceAlertAgencyIds;
  if (!alertAgencies?.length) return [];
  let entities: transit_realtime.FeedEntity[];
  try {
    entities = await fetchFeedEntities(MTA_ALERTS_FEED_URL);
  } catch (error) {
    logger.warn('Could not load MTA service alerts', {
      agencyId,
      event: 'gtfs_alerts_failed',
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const nowSeconds = nowMs / 1000;
  const alerts: RouteAlert[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    const alert = entity.alert;
    if (!alert || seen.has(entity.id)) continue;
    const forRoute = (alert.informedEntity ?? []).some((informed) => informed.routeId === routeId && alertAgencies.includes(informed.agencyId ?? ''));
    if (!forRoute || !isActive(alert, nowSeconds)) continue;
    const header = englishText(alert.headerText);
    if (!header) continue;
    seen.add(entity.id);
    alerts.push({ id: entity.id, header, description: englishText(alert.descriptionText) });
  }
  return alerts;
}
