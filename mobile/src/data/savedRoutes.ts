import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';

import { db } from '../lib/firebase';
import type { IndexedLine } from './lineIndex';
import { discoveredRouteToRouteDetail, type DiscoveredRoute } from './nearbyTransit';
import type { LiveSource, RouteDetail } from './transit';

/**
 * When a saved line's service alerts are pushed: any time, during the rider's own hours, or never.
 * 'peak' (weekday rush hours) is from before Custom hours; lines saved with it keep working.
 * Mirrors firebase/functions/src/routeAlerts.ts's RouteAlertSetting.
 */
export type RouteAlertSetting = 'all' | 'peak' | 'custom' | 'off';

/** A daily alert window, in minutes after midnight; `end` before `start` runs overnight. */
export type AlertHours = { start: number; end: number };

/** Custom hours start here until the rider changes them: the working day. */
export const DEFAULT_ALERT_HOURS: AlertHours = { start: 7 * 60, end: 19 * 60 };

export const ROUTE_ALERT_OPTIONS: readonly { value: RouteAlertSetting; label: string }[] = [
  { value: 'all', label: 'All times' },
  { value: 'custom', label: 'Custom hours' },
  { value: 'off', label: 'Never' },
];

/** "7:30 AM" for minutes after midnight. */
export function formatAlertTime(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * A typed time of day as minutes after midnight: "7", "7:30", "730", "7:30 pm", "7pm", "19:30".
 * A bare hour from 1 to 11 without am/pm is read as morning. Null when it isn't a time.
 */
export function parseAlertTime(text: string): number | null {
  const match = /^\s*(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?\.?\s*$/i.exec(text.replace(/\./g, ''));
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase().startsWith('p') ? 'pm' : match[3] ? 'am' : null;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** A line's alert setting in a few words: "All times", "7:00 AM – 7:00 PM", "Never". */
export function describeRouteAlerts(setting: RouteAlertSetting, hours?: AlertHours): string {
  if (setting === 'all') return 'All times';
  if (setting === 'peak') return 'Weekday rush hours';
  if (setting === 'custom') {
    const window = hours ?? DEFAULT_ALERT_HOURS;
    return `${formatAlertTime(window.start)} – ${formatAlertTime(window.end)}`;
  }
  return 'Never';
}

type SavedStop = { stopId: string; name: string; headsign: string | null } | null;

/**
 * A saved transit line (users/{uid}/savedRoutes/{agencyId:routeId}): enough to show its card
 * anywhere, even far from it, and its alert setting. Firestore rules mirror this shape.
 */
export type SavedRoute = {
  /** `${agencyId}:${routeId}`, the same id a discovered route's card has. */
  id: string;
  agencyId: LiveSource['agencyId'];
  routeId: string;
  agencyName: string;
  routeName: string;
  shortName: string;
  color: string;
  /**
   * Starred, so it shows in Favorites and on the home sheet. A line can have alerts without being
   * starred (and a star without alerts); records saved before this field existed were all starred.
   */
  favorite: boolean;
  alerts: RouteAlertSetting;
  /** The daily window for 'custom' alerts. */
  alertHours?: AlertHours;
  direction1: SavedStop;
  direction0: SavedStop;
};

const SAVED_ROUTES = 'savedRoutes';
const MAX_SAVED_ROUTES = 50;
// Firestore document ids can't contain "/"; route ids rarely do, but a few agencies' might.
const routeKey = (id: string) => id.replace(/\//g, '_');

/** The saved line a route view stands for, its stop picked from either direction. */
export function savedRouteFrom(route: RouteDetail, alerts: RouteAlertSetting, favorite = true): SavedRoute | null {
  const source = route.liveSource;
  if (!source) return null;
  const direction1 = route.directions[source.direction1Index];
  const direction0 = route.directions[source.direction1Index === 0 ? 1 : 0];
  const stop = (direction: RouteDetail['directions'][number] | undefined, stopId: string): SavedStop => (
    stopId ? { stopId, name: direction?.stopName ?? '', headsign: direction?.direction ?? null } : null
  );
  return {
    id: `${source.agencyId}:${source.routeId}`,
    agencyId: source.agencyId,
    routeId: source.routeId,
    agencyName: route.agency,
    routeName: route.routeName,
    shortName: route.shortName,
    color: route.color,
    favorite,
    alerts,
    direction1: stop(direction1, direction1?.stopId ?? source.direction1StopId),
    direction0: stop(direction0, direction0?.stopId ?? source.direction0StopId),
  };
}

/**
 * A line picked from search (Settings > Notifications), with alerts on and no star. It has no stop
 * yet: its card finds the stops nearest the rider wherever they are, like a starred line far away.
 */
export function savedRouteFromLine(line: IndexedLine, alerts: RouteAlertSetting = 'all'): SavedRoute {
  return {
    id: `${line.agencyId}:${line.routeId}`,
    agencyId: line.agencyId,
    routeId: line.routeId,
    agencyName: line.agencyDisplayName,
    routeName: line.routeName,
    shortName: line.shortName,
    color: line.color,
    favorite: false,
    alerts,
    direction1: null,
    direction0: null,
  };
}

/** A saved line as a route card: live data finds its stops nearest the rider wherever they are. */
export function savedRouteToRouteDetail(saved: SavedRoute): RouteDetail {
  const discovered: DiscoveredRoute = {
    agencyId: saved.agencyId,
    agencyDisplayName: saved.agencyName,
    routeId: saved.routeId,
    routeName: saved.routeName,
    shortName: saved.shortName,
    color: saved.color,
    distanceMeters: 0,
    direction1: saved.direction1,
    direction0: saved.direction0,
  };
  return discoveredRouteToRouteDetail(discovered);
}

export function saveRoute(uid: string, saved: SavedRoute) {
  const { id, ...fields } = saved;
  return setDoc(doc(db, 'users', uid, SAVED_ROUTES, routeKey(id)), { ...fields, dateSaved: serverTimestamp() });
}

export function removeSavedRoute(uid: string, id: string) {
  return deleteDoc(doc(db, 'users', uid, SAVED_ROUTES, routeKey(id)));
}

/** Stars or unstars a line that already has a record (for its alerts, or an earlier star). */
export function setRouteFavorite(uid: string, id: string, favorite: boolean) {
  return setDoc(doc(db, 'users', uid, SAVED_ROUTES, routeKey(id)), { favorite }, { merge: true });
}

export function setRouteAlerts(uid: string, id: string, alerts: RouteAlertSetting, alertHours?: AlertHours) {
  return setDoc(doc(db, 'users', uid, SAVED_ROUTES, routeKey(id)), { alerts, ...(alerts === 'custom' ? { alertHours: alertHours ?? DEFAULT_ALERT_HOURS } : {}) }, { merge: true });
}

/** Settings' "Allow notifications" or "Service alerts" turned off: the backend sends no line alerts at all. */
export function setRouteAlertsPaused(uid: string, paused: boolean) {
  return setDoc(doc(db, 'users', uid), { routeAlertsPaused: paused }, { merge: true });
}

/** The rider's lines with a record (starred, or with alerts), oldest first (the order they were saved in). */
export function subscribeToSavedRoutes(uid: string, onChange: (routes: SavedRoute[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, SAVED_ROUTES), orderBy('dateSaved', 'asc'), limit(MAX_SAVED_ROUTES)),
    (snapshot) => onChange(snapshot.docs.map((entry) => {
      const data = entry.data() as Omit<SavedRoute, 'id' | 'favorite'> & { favorite?: boolean };
      return { ...data, favorite: data.favorite ?? true, id: `${data.agencyId}:${data.routeId}` };
    })),
    // Offline/permission errors leave the list as it was.
    () => undefined,
  );
}
