import { createHash } from 'node:crypto';

import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

import { getRouteAlerts, type RouteAlert } from './gtfsAlerts';
import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';

/** Mirrors mobile/src/data/savedRoutes.ts's RouteAlertSetting. */
export type RouteAlertSetting = 'all' | 'peak' | 'off';

/** The fields of users/{uid}/savedRoutes/{id} this reads (savedRoutes.ts's SavedRoute). */
type SavedRouteDoc = { agencyId: string; routeId: string; shortName?: string; routeName?: string; alerts?: RouteAlertSetting };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts up to 100 messages per request. */
const EXPO_BATCH = 100;
/** An alert already sent to a rider isn't sent again for this long, even if it stays active. */
const SENT_ALERT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Weekday rush hours in New York, when "Peak times" alerts are sent: 6–10 AM and 4–8 PM.
 * `now` is read in America/New_York whatever the server's own time zone.
 */
export function isPeakTime(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? -1);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20);
}

/** Whether a saved route's setting wants alerts right now. */
export function wantsAlertsNow(setting: RouteAlertSetting | undefined, now: Date): boolean {
  return setting === 'all' || (setting === 'peak' && isPeakTime(now));
}

/** The push a rider gets for one alert on one of their saved lines. */
export function alertMessage(route: SavedRouteDoc, alert: RouteAlert): { title: string; body: string } {
  const name = route.shortName || route.routeName || route.routeId;
  return { title: `${name} service alert`, body: alert.header };
}

const sentKey = (route: SavedRouteDoc, alert: RouteAlert) => createHash('sha256').update(`${route.agencyId}:${route.routeId}:${alert.id}:${alert.header}`).digest('hex').slice(0, 40);

/**
 * Sends each rider a push for new service alerts on the lines they saved with alerts on, "Peak
 * times" ones only during weekday rush hours. Each alert reaches a rider once (users/{uid}/
 * sentAlerts), and each route's alerts are read once per run however many riders saved it.
 */
export async function sendSavedRouteAlerts(now = new Date()): Promise<{ sent: number }> {
  const app = getApps()[0] ?? initializeApp();
  const firestore = getFirestore(app);
  const saved = await firestore.collectionGroup('savedRoutes').where('alerts', 'in', ['all', 'peak']).get();

  const alertsByRoute = new Map<string, Promise<RouteAlert[]>>();
  const alertsFor = (agencyId: AgencyId, routeId: string) => {
    const key = `${agencyId}:${routeId}`;
    if (!alertsByRoute.has(key)) alertsByRoute.set(key, getRouteAlerts(agencyId, routeId, now.getTime()).catch(() => []));
    return alertsByRoute.get(key)!;
  };

  const messages: { to: string[]; title: string; body: string; data: Record<string, string>; sound: 'default' }[] = [];
  const pushTokensByUser = new Map<string, Promise<string[]>>();
  for (const doc of saved.docs) {
    const route = doc.data() as SavedRouteDoc;
    const uid = doc.ref.parent.parent?.id;
    if (!uid || !Object.hasOwn(AGENCY_CONFIGS, route.agencyId) || !wantsAlertsNow(route.alerts, now)) continue;
    const alerts = await alertsFor(route.agencyId as AgencyId, route.routeId);
    if (alerts.length === 0) continue;
    if (!pushTokensByUser.has(uid)) {
      pushTokensByUser.set(uid, firestore.collection('users').doc(uid).get().then((user) => {
        // Settings' "Allow notifications" or "Service alerts" is off on the rider's phone.
        if (user.data()?.routeAlertsPaused === true) return [];
        const tokens = user.data()?.pushTokens;
        return Array.isArray(tokens) ? tokens.filter((token): token is string => typeof token === 'string') : [];
      }));
    }
    const tokens = await pushTokensByUser.get(uid)!;
    if (tokens.length === 0) continue;
    for (const alert of alerts) {
      const sentRef = firestore.collection('users').doc(uid).collection('sentAlerts').doc(sentKey(route, alert));
      // create() fails if it exists: that alert already went to this rider.
      const fresh = await sentRef.create({ sentAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(now.getTime() + SENT_ALERT_TTL_MS) }).then(() => true, () => false);
      if (!fresh) continue;
      messages.push({ to: tokens, ...alertMessage(route, alert), data: { agencyId: route.agencyId, routeId: route.routeId }, sound: 'default' });
    }
  }

  for (let index = 0; index < messages.length; index += EXPO_BATCH) {
    const batch = messages.slice(index, index + EXPO_BATCH);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!response.ok) logger.warn('Expo push request failed', { status: response.status });
    } catch (error) {
      logger.warn('Expo push request failed', { error: String(error) });
    }
  }
  return { sent: messages.length };
}
