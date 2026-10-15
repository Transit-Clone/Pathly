import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CURRENT_LOCATION_LABEL,
  hasRoutableTripPlace,
  planTrip,
  type Itinerary,
  type ResumePlanRequest,
  type TripEndpoints,
  type TripMode,
  type TripPlanProblem,
} from '../data/tripPlanning';
import type { RoutePreference, TripTimeChoice } from '../data/transit';
import type { Coordinates } from './useCurrentLocation';

export type TripPlanState =
  | { status: 'loading' }
  | { status: 'loaded'; itineraries: Itinerary[]; fetchedAt: number; refreshing: boolean; resumeRequest: ResumePlanRequest }
  | { status: 'problem'; problem: TripPlanProblem; field?: 'origin' | 'destination' };

type UseTripPlanOptions = {
  endpoints: TripEndpoints;
  time: TripTimeChoice;
  preference: RoutePreference;
  modes: readonly TripMode[];
  /** The rider's real position, or null when unknown. */
  location: Coordinates | null;
  /** True while the first location fix is still coming; "Current location" trips wait for it. */
  locationPending: boolean;
};

/** A finished plan and the request (criteria key and refresh count) it answers. */
type Answer = { key: string; refresh: number; state: Exclude<TripPlanState, { status: 'loading' }> };

/**
 * Real itineraries for Route Results' criteria. Plans again when an endpoint, the time, the
 * modes, or the fewer-transfers preference change (fastest and lowest fare only re-sort), and on
 * refresh, which keeps showing the current itineraries meanwhile. The rider's position is read
 * when planning, so routine GPS updates don't plan (and bill) again.
 */
export function useTripPlan({ endpoints, time, preference, modes, location, locationPending }: UseTripPlanOptions) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // A Recent deliberately carries the coordinate that was called "Current location" when the
  // trip ran. That saved endpoint is routable on its own and must not wait forever for a new fix.
  const needsLiveOrigin = endpoints.origin === CURRENT_LOCATION_LABEL
    && !hasRoutableTripPlace(endpoints.origin, endpoints.originPlace);
  const waitsForLocation = needsLiveOrigin && locationPending;
  const key = JSON.stringify({
    origin: [endpoints.origin, endpoints.originPlace?.id],
    destination: [endpoints.destination, endpoints.destinationPlace?.id],
    time,
    transfers: preference === 'transfers',
    modes: [...modes].sort(),
    hasLocation: needsLiveOrigin && location !== null,
  });
  // The refresh count the current criteria were first planned at: later counts are refreshes.
  const plannedAt = useRef<{ key: string; refresh: number } | null>(null);

  useEffect(() => {
    if (waitsForLocation) return undefined;
    const refresh = plannedAt.current?.key === key && plannedAt.current.refresh !== refreshCount;
    plannedAt.current = { key, refresh: refreshCount };
    let cancelled = false;
    void planTrip({ endpoints, location: locationRef.current, time, preference, modes, refresh }).then((result) => {
      if (cancelled) return;
      setAnswer({
        key,
        refresh: refreshCount,
        state: result.ok
          ? { status: 'loaded', itineraries: result.itineraries, fetchedAt: result.fetchedAt, refreshing: false, resumeRequest: result.resumeRequest }
          : { status: 'problem', problem: result.problem, ...(result.field ? { field: result.field } : {}) },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers every input that changes the plan
  }, [key, refreshCount, waitsForLocation]);

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  let state: TripPlanState;
  if (waitsForLocation || !answer || answer.key !== key) state = { status: 'loading' };
  else if (answer.refresh !== refreshCount) state = answer.state.status === 'loaded' ? { ...answer.state, refreshing: true } : { status: 'loading' };
  else state = answer.state;
  return { state, refresh };
}
