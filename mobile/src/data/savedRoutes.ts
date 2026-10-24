import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { discoveredRouteToRouteDetail, type DiscoveredRoute } from './nearbyTransit';
import type { LiveSource, RouteDetail } from './transit';

/**
 * When a saved line's service alerts are pushed: any time, weekday rush hours only, or never.
 * Mirrors firebase/functions/src/routeAlerts.ts's RouteAlertSetting.
 */
export type RouteAlertSetting = 'all' | 'peak' | 'off';

export const ROUTE_ALERT_OPTIONS: readonly { value: RouteAlertSetting; label: string; detail: string }[] = [
  { value: 'all', label: 'All times', detail: 'Any service change, day or night' },
  { value: 'peak', label: 'Peak times', detail: 'Weekdays 6–10 AM and 4–8 PM' },
  { value: 'off', label: 'Off', detail: 'No notifications for this line' },
];

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
  alerts: RouteAlertSetting;
  direction1: SavedStop;
  direction0: SavedStop;
};

const SAVED_ROUTES = 'savedRoutes';
const MAX_SAVED_ROUTES = 50;
// Firestore document ids can't contain "/"; route ids rarely do, but a few agencies' might.
const routeKey = (id: string) => id.replace(/\//g, '_');

/** The saved line a route view stands for, its stop picked from either direction. */
export function savedRouteFrom(route: RouteDetail, alerts: RouteAlertSetting): SavedRoute | null {
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
    alerts,
    direction1: stop(direction1, direction1?.stopId ?? source.direction1StopId),
    direction0: stop(direction0, direction0?.stopId ?? source.direction0StopId),
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

export function setRouteAlerts(uid: string, id: string, alerts: RouteAlertSetting) {
  return setDoc(doc(db, 'users', uid, SAVED_ROUTES, routeKey(id)), { alerts }, { merge: true });
}

/** Settings' "Allow notifications" or "Service alerts" turned off: the backend sends no line alerts at all. */
export function setRouteAlertsPaused(uid: string, paused: boolean) {
  return setDoc(doc(db, 'users', uid), { routeAlertsPaused: paused }, { merge: true });
}

/** The rider's saved lines, oldest first (the order they were saved in). */
export function subscribeToSavedRoutes(uid: string, onChange: (routes: SavedRoute[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, SAVED_ROUTES), orderBy('dateSaved', 'asc'), limit(MAX_SAVED_ROUTES)),
    (snapshot) => onChange(snapshot.docs.map((entry) => {
      const data = entry.data() as Omit<SavedRoute, 'id'>;
      return { ...data, id: `${data.agencyId}:${data.routeId}` };
    })),
    // Offline/permission errors leave the list as it was.
    () => undefined,
  );
}
