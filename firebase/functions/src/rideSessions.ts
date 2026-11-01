import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { haversineMeters } from './geo';
import type { AgencyId } from './gtfsAgencies';
import type { GtfsVehicleStatus } from './gtfsStatus';

/**
 * Riders who've opted in and are moving with a vehicle (mobile/src/data/rideDetection.ts). Each
 * has one rideSessions/{uid} doc that holds only their latest position on that vehicle, expires on
 * its own, and is never readable by clients (firestore.rules): other riders only ever see an
 * avatar, a count, and the vehicle's position.
 */
export const RIDE_SESSION_TTL_MS = 90_000;
export const MAX_RIDER_ACCURACY_METERS = 100;
/** At most this many avatars are sent per vehicle; the map stacks them. */
const MAX_AVATARS = 3;
const RIDERS_CACHE_TTL_MS = 10_000;

export type RideSession = { uid: string; tripId: string; lat: number; lon: number; avatar: unknown; reportedAtMs: number; expiresAtMs: number };

/**
 * How far from the agency's last position a rider can plausibly be on that vehicle: GPS error,
 * plus how far it may have gone since the feed measured it (30 m/s is about 65 mph), up to a minute.
 */
export function maxRiderGapMeters(feedAgeSeconds: number | null): number {
  return 200 + 30 * Math.min(Math.max(0, feedAgeSeconds ?? 60), 60);
}

export function riderGapAllowed(vehicle: Pick<GtfsVehicleStatus, 'lat' | 'lon' | 'timestamp'>, rider: { lat: number; lon: number }, nowMs: number): boolean {
  const age = vehicle.timestamp != null ? nowMs / 1000 - vehicle.timestamp : null;
  return haversineMeters(vehicle.lat, vehicle.lon, rider.lat, rider.lon) <= maxRiderGapMeters(age);
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export type VehicleRiders = {
  count: number;
  avatars: unknown[];
  /** The rider asking is one of them. */
  you: boolean;
  /** Where the agency's own feed puts the vehicle: rider detection must compare against this, not the position riders moved it to. */
  feed: { lat: number; lon: number; timestamp: number | null };
};

/**
 * Vehicles with their current riders: the median of riders' positions replaces the feed's (so one
 * bad reading can't move a vehicle with others aboard), and the asker's avatar comes first. A
 * session the feed has since moved away from is left out. Uids never leave this function.
 */
export function withRiders<T extends GtfsVehicleStatus>(vehicles: readonly T[], sessions: readonly RideSession[], uid: string | undefined, nowMs: number): (T & { riders?: VehicleRiders })[] {
  return vehicles.map((vehicle) => {
    const aboard = sessions
      .filter((session) => session.tripId === vehicle.tripId && session.expiresAtMs > nowMs && riderGapAllowed(vehicle, session, nowMs))
      .sort((a, b) => Number(b.uid === uid) - Number(a.uid === uid) || b.reportedAtMs - a.reportedAtMs);
    if (aboard.length === 0) return vehicle;
    return {
      ...vehicle,
      lat: median(aboard.map((session) => session.lat)),
      lon: median(aboard.map((session) => session.lon)),
      timestamp: Math.floor(Math.max(...aboard.map((session) => session.reportedAtMs)) / 1000),
      riders: {
        count: aboard.length,
        avatars: aboard.slice(0, MAX_AVATARS).map((session) => session.avatar),
        you: aboard.some((session) => session.uid === uid),
        feed: { lat: vehicle.lat, lon: vehicle.lon, timestamp: vehicle.timestamp },
      },
    };
  });
}

const firestore = () => getFirestore(getApps()[0] ?? initializeApp());
const routeKey = (agencyId: AgencyId, routeId: string) => `${agencyId}:${routeId}`;
const sessionsCache = new Map<string, { expiresAt: number; sessions: Promise<RideSession[]> }>();

/** A route's sessions, read at most every few seconds however many riders are polling it. */
export function routeRideSessions(agencyId: AgencyId, routeId: string, nowMs = Date.now()): Promise<RideSession[]> {
  const key = routeKey(agencyId, routeId);
  const hit = sessionsCache.get(key);
  if (hit && hit.expiresAt > nowMs) return hit.sessions;
  const sessions = firestore().collection('rideSessions').where('routeKey', '==', key).get().then(
    (snapshot) => snapshot.docs.map((doc): RideSession => {
      const data = doc.data();
      return { uid: doc.id, tripId: data.tripId, lat: data.lat, lon: data.lon, avatar: data.avatar ?? null, reportedAtMs: data.reportedAtMs, expiresAtMs: (data.expiresAt as Timestamp).toMillis() };
    }),
    (error: unknown) => {
      // Riders are extra to the live data; the agency's positions still show.
      logger.warn('Could not read ride sessions', { reason: error instanceof Error ? error.message : String(error) });
      return [];
    },
  );
  sessionsCache.set(key, { expiresAt: nowMs + RIDERS_CACHE_TTL_MS, sessions });
  return sessions;
}

export async function saveRideSession(uid: string, agencyId: AgencyId, routeId: string, tripId: string, rider: { lat: number; lon: number }, nowMs = Date.now()): Promise<void> {
  const db = firestore();
  const profile = await db.collection('users').doc(uid).get();
  await db.collection('rideSessions').doc(uid).set({
    routeKey: routeKey(agencyId, routeId),
    tripId,
    lat: rider.lat,
    lon: rider.lon,
    avatar: profile.data()?.avatar ?? null,
    reportedAtMs: nowMs,
    expiresAt: Timestamp.fromMillis(nowMs + RIDE_SESSION_TTL_MS),
  });
  sessionsCache.delete(routeKey(agencyId, routeId));
}

export async function deleteRideSession(uid: string): Promise<void> {
  const ref = firestore().collection('rideSessions').doc(uid);
  const key = (await ref.get()).data()?.routeKey;
  await ref.delete();
  if (typeof key === 'string') sessionsCache.delete(key);
}
