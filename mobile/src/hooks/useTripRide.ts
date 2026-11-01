import { useAuth } from '../auth/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';

import { visibleTrains } from '../data/liveTrains';
import { IDLE_RIDE, nextRideState, type RideFix, type RideState } from '../data/rideDetection';
import { dismissedNow, feedVehicles, useRideTracking, type RideTracking } from '../data/rideTracking';
import { fetchRouteLiveData, type RouteLiveVehicle } from '../data/transitLive';
import type { TripStep } from '../data/tripPlanning';
import { useUserPreferences } from '../data/userPreferences';
import { legSource } from './useTripVehicles';

/** As often as useTripVehicles asks; the feeds themselves update every few seconds. */
const POLL_MS = 15_000;
const NO_VEHICLES: readonly RouteLiveVehicle[] = [];

/**
 * The vehicle a rider is on, from their recent locations alone: on this device, sent nowhere, and
 * with or without "Share my rides", so the navigation map can leave it off.
 */
export function useOnBoardVehicle(vehicles: readonly RouteLiveVehicle[], fix: RideFix | null): string | null {
  const [state, setState] = useState<RideState>(IDLE_RIDE);
  const vehiclesRef = useRef(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);
  const lastFixAt = useRef<number | null>(null);
  useEffect(() => {
    if (!fix || fix.at === lastFixAt.current) return;
    lastFixAt.current = fix.at;
    setState((current) => nextRideState(current, fix, feedVehicles(vehiclesRef.current), dismissedNow(fix.at)));
  }, [fix]);
  if (state.phase !== 'riding') return null;
  return fix && dismissedNow(fix.at).has(state.tripId) ? null : state.tripId;
}

/**
 * Ride tracking for the leg a rider is navigating: `step` is the ride they're waiting for or on
 * (anything else tracks nothing). Asks for the line's vehicles only with "Share my rides" on, and
 * moving to another leg ends the session, so one is never carried onto the next line.
 */
export function useTripRide(step: TripStep | undefined, fix: RideFix | null): RideTracking {
  const { preferences } = useUserPreferences();
  const { user } = useAuth();
  const liveRoute = step?.kind === 'transit' ? step.liveRoute : undefined;
  const key = liveRoute ? `${liveRoute.agencyId}:${liveRoute.routeId}:${liveRoute.directionId ?? ''}` : null;
  const source = useMemo(() => (liveRoute ? legSource(liveRoute) : undefined), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the line, not the step object
  const [loaded, setLoaded] = useState<{ key: string; vehicles: readonly RouteLiveVehicle[] } | null>(null);
  const directionId = liveRoute?.directionId;
  const shouldPoll = preferences.shareRides && !user?.isAnonymous && source != null;

  useEffect(() => {
    if (!shouldPoll || !source || !key) return undefined;
    let cancelled = false;
    const load = () => {
      void fetchRouteLiveData(source).then(
        (data) => {
          if (!cancelled) setLoaded({ key, vehicles: visibleTrains(data.vehicles, directionId, Date.now()) });
        },
        () => undefined, // Offline: the session expires by itself if this lasts.
      );
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [directionId, key, shouldPoll, source]);

  return useRideTracking(source, loaded?.key === key ? loaded.vehicles : NO_VEHICLES, fix);
}
