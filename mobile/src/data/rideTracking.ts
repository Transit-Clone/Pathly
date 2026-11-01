import { useAuth } from '../auth/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BeanAvatarConfig } from '../avatars/beanAvatar';
import { callable } from '../lib/firebase';
import type { NavigationFix } from './enrouteNavigation';
import { IDLE_RIDE, nextRideState, type FeedVehicle, type RideFix, type RideState } from './rideDetection';
import type { LiveSource } from './transit';
import type { RouteLiveVehicle } from './transitLive';
import { useUserPreferences } from './userPreferences';

/** The session lasts 90 s on the backend, so a missed report doesn't drop the rider. */
const REPORT_INTERVAL_MS = 30_000;
/** "I'm not on this" keeps a vehicle from being picked again for this long. */
const DISMISS_MS = 30 * 60 * 1000;

const reportRide = callable<{ agencyId: string; routeId: string; tripId: string; lat: number; lon: number; accuracyMeters: number }, { accepted: boolean }>('reportRide');
const stopRide = callable<Record<string, never>, { ok: true }>('stopRide');

/** Ends this rider's session right away, if any (also expires by itself). */
export function endRideSession(): Promise<void> {
  return stopRide({}).then(() => undefined, () => undefined);
}

// Outlives one Route View, so reopening the line doesn't pick the dismissed vehicle again.
const dismissedUntil = new Map<string, number>();
export const dismissedNow = (now: number) => new Set([...dismissedUntil].filter(([, until]) => until > now).map(([tripId]) => tripId));

/** A fresh, real GPS fix for detection, or null: an admin's mock location must never place a vehicle for other riders. */
export function rideFixFrom(fix: NavigationFix | null, stale: boolean): RideFix | null {
  if (!fix || stale || fix.source !== 'real') return null;
  return { at: fix.capturedAt, lat: fix.point.lat, lon: fix.point.lng, accuracyMeters: fix.accuracyMeters };
}

/** The agency's position: detection must not follow a vehicle that riders (even this one) moved. */
export function feedVehicles(vehicles: readonly RouteLiveVehicle[]): FeedVehicle[] {
  return vehicles.map((vehicle) => (vehicle.riders?.feed
    ? { tripId: vehicle.tripId, ...vehicle.riders.feed }
    : { tripId: vehicle.tripId, lat: vehicle.lat, lon: vehicle.lon, updatedAt: vehicle.updatedAt }));
}

/** The rider's own avatar on the vehicle they're on, first in its stack, when the backend isn't already showing it (sharing off, or not reported yet). */
export function withOwnAvatar<T extends RouteLiveVehicle>(vehicle: T, avatar: BeanAvatarConfig): T {
  const riders = vehicle.riders;
  if (riders?.you) return vehicle;
  return {
    ...vehicle,
    riders: {
      count: (riders?.count ?? 0) + 1,
      avatars: [avatar, ...(riders?.avatars ?? [])].slice(0, 3),
      you: true,
      feed: riders?.feed ?? { lat: vehicle.lat, lon: vehicle.lon, updatedAt: vehicle.updatedAt },
    },
  };
}

export type RideTracking = {
  /** The trip this rider is sharing, once the backend has accepted it. */
  ridingTripId: string | null;
  sharingEnabled: boolean;
  /** "I'm on this": skips the wait for movement. The backend still checks they're near it. */
  claim: (tripId: string) => void;
  /** "I'm not on this": ends the ride and leaves this vehicle alone for a while. */
  dismiss: (tripId: string) => void;
};

/**
 * While Route View or trip navigation is open, turns the rider's GPS fixes into a shared ride on one of the line's
 * vehicles (rideDetection.ts). Does nothing, and sends nothing, until Settings -> Privacy's "Share
 * my rides" is on. Leaving the page or turning it off ends the session at once.
 */
export function useRideTracking(source: LiveSource | undefined, vehicles: readonly RouteLiveVehicle[], fix: RideFix | null): RideTracking {
  const { preferences } = useUserPreferences();
  const { user } = useAuth();
  const sharingEnabled = preferences.shareRides && !user?.isAnonymous && source != null;
  const [state, setState] = useState<RideState>(IDLE_RIDE);
  const [ridingTripId, setRidingTripId] = useState<string | null>(null);
  const lastReport = useRef<{ tripId: string; at: number } | null>(null);
  const lastFixAt = useRef<number | null>(null);
  const sessionOpen = useRef(false);
  const vehiclesRef = useRef(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  const rideGeneration = useRef(0);

  const end = useCallback(() => {
    rideGeneration.current += 1;
    setState(IDLE_RIDE);
    setRidingTripId(null);
    lastReport.current = null;
    if (sessionOpen.current) void endRideSession();
    sessionOpen.current = false;
  }, []);

  const report = useCallback((tripId: string, at: RideFix) => {
    if (!source) return;
    lastReport.current = { tripId, at: at.at };
    const generation = rideGeneration.current;
    void reportRide({ agencyId: source.agencyId, routeId: source.routeId, tripId, lat: at.lat, lon: at.lon, accuracyMeters: at.accuracyMeters ?? 0 }).then(
      ({ data }) => {
        // The ride ended while this was on its way: its session mustn't outlive that.
        if (generation !== rideGeneration.current) {
          if (data.accepted) void endRideSession();
          return;
        }
        if (data.accepted) {
          sessionOpen.current = true;
          setRidingTripId(tripId);
          return;
        }
        // Too far from the vehicle, or it's gone: not a ride, and not one to re-detect right away.
        dismissedUntil.set(tripId, Date.now() + DISMISS_MS);
        sessionOpen.current = false;
        setRidingTripId(null);
        setState(IDLE_RIDE);
      },
      () => undefined, // Offline: the next fix tries again, and the session expires if it can't.
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable ids
  }, [source?.agencyId, source?.routeId]);

  useEffect(() => {
    if (!sharingEnabled || !fix || fix.at === lastFixAt.current) return;
    lastFixAt.current = fix.at;
    const next = nextRideState(state, fix, feedVehicles(vehiclesRef.current), dismissedNow(fix.at));
    if (next !== state) setState(next);
    if (next.phase === 'riding') {
      const due = !lastReport.current || lastReport.current.tripId !== next.tripId || fix.at - lastReport.current.at >= REPORT_INTERVAL_MS;
      if (due) report(next.tripId, fix);
    } else if (state.phase === 'riding') {
      end();
    }
  }, [end, fix, report, sharingEnabled, state]);

  // Turned off: forgotten here during render (as elsewhere in the app), and closed on the backend below.
  if (!sharingEnabled && state !== IDLE_RIDE) setState(IDLE_RIDE);
  if (!sharingEnabled && ridingTripId !== null) setRidingTripId(null);
  useEffect(() => {
    if (sharingEnabled) return;
    rideGeneration.current += 1;
    lastReport.current = null;
    if (sessionOpen.current) void endRideSession();
    sessionOpen.current = false;
  }, [sharingEnabled]);
  // Leaving the page, or moving on to another line, ends the session.
  useEffect(() => end, [end, source?.agencyId, source?.routeId]);

  const claim = useCallback((tripId: string) => {
    if (!sharingEnabled || !fix) return;
    dismissedUntil.delete(tripId);
    setState({ phase: 'riding', tripId, misses: 0 });
    report(tripId, fix);
  }, [fix, report, sharingEnabled]);

  const dismiss = useCallback((tripId: string) => {
    dismissedUntil.set(tripId, Date.now() + DISMISS_MS);
    end();
  }, [end]);

  return { ridingTripId, sharingEnabled, claim, dismiss };
}
