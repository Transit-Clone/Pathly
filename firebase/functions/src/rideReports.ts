import { createHash } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { AgencyId } from './gtfsAgencies';

/**
 * What riders say about the vehicle they're on (mobile/src/data/rideReports.ts). Each rideReports
 * doc expires on its own, is never readable by clients (firestore.rules), and holds no position:
 * other riders only ever see a kind and a count.
 */
export const RIDE_REPORT_KINDS = ['seats', 'packed', 'temperature', 'stuck', 'dirty'] as const;
export type RideReportKind = typeof RIDE_REPORT_KINDS[number];
export const RIDE_REPORT_TTL_MS = 20 * 60 * 1000;
const REPORTS_CACHE_TTL_MS = 10_000;
/** A rider's newer word on how full it is replaces the older one. */
const OPPOSITES: Partial<Record<RideReportKind, RideReportKind>> = { seats: 'packed', packed: 'seats' };

export type RideReport = { tripId: string; kind: RideReportKind; expiresAtMs: number };

export function isRideReportKind(value: unknown): value is RideReportKind {
  return RIDE_REPORT_KINDS.includes(value as RideReportKind);
}

/** Vehicles with their current reports, most-reported first. Who reported never leaves the backend. */
export function withReports<T extends { tripId: string }>(vehicles: readonly T[], reports: readonly RideReport[], nowMs: number): (T & { reports?: { kind: RideReportKind; count: number }[] })[] {
  return vehicles.map((vehicle) => {
    const counts = new Map<RideReportKind, number>();
    for (const report of reports) {
      if (report.tripId === vehicle.tripId && report.expiresAtMs > nowMs) counts.set(report.kind, (counts.get(report.kind) ?? 0) + 1);
    }
    if (counts.size === 0) return vehicle;
    return { ...vehicle, reports: [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count) };
  });
}

const firestore = () => getFirestore(getApps()[0] ?? initializeApp());
const routeKey = (agencyId: AgencyId, routeId: string) => `${agencyId}:${routeId}`;
const reportId = (uid: string, tripId: string, kind: RideReportKind) => createHash('sha256').update(`${uid}:${tripId}:${kind}`).digest('hex').slice(0, 40);
const reportsCache = new Map<string, { expiresAt: number; reports: Promise<RideReport[]> }>();

/** A route's reports, read at most every few seconds however many riders are polling it. */
export function routeRideReports(agencyId: AgencyId, routeId: string, nowMs = Date.now()): Promise<RideReport[]> {
  const key = routeKey(agencyId, routeId);
  const hit = reportsCache.get(key);
  if (hit && hit.expiresAt > nowMs) return hit.reports;
  const reports = firestore().collection('rideReports').where('routeKey', '==', key).get().then(
    (snapshot) => snapshot.docs.map((doc): RideReport => {
      const data = doc.data();
      return { tripId: data.tripId, kind: data.kind, expiresAtMs: (data.expiresAt as Timestamp).toMillis() };
    }),
    (error: unknown) => {
      // Reports are extra to the live data, which still shows.
      logger.warn('Could not read ride reports', { reason: error instanceof Error ? error.message : String(error) });
      return [];
    },
  );
  reportsCache.set(key, { expiresAt: nowMs + REPORTS_CACHE_TTL_MS, reports });
  return reports;
}

/** One rider counts once per kind per vehicle, however often they tap. */
export async function saveRideReport(uid: string, agencyId: AgencyId, routeId: string, tripId: string, kind: RideReportKind, nowMs = Date.now()): Promise<void> {
  const collection = firestore().collection('rideReports');
  const opposite = OPPOSITES[kind];
  const batch = firestore().batch();
  batch.set(collection.doc(reportId(uid, tripId, kind)), { routeKey: routeKey(agencyId, routeId), tripId, kind, expiresAt: Timestamp.fromMillis(nowMs + RIDE_REPORT_TTL_MS) });
  if (opposite) batch.delete(collection.doc(reportId(uid, tripId, opposite)));
  await batch.commit();
  reportsCache.delete(routeKey(agencyId, routeId));
}
