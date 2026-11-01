import { useEffect, useMemo, useState } from 'react';

import { callable } from '../lib/firebase';
import { readCache, writeCache } from './deviceCache';
import type { LiveSource } from './transit';
import type { Itinerary } from './tripPlanning';

type AgencyId = LiveSource['agencyId'];

/** firebase/functions/src/accessibleStops.ts's AccessibleStops. */
export type AccessibleStops = { everyStop: boolean; stopIds: string[] };

const CACHE_KEY = (agencyId: AgencyId) => `pathly.accessibleStops.v1.${agencyId}`;
// Elevators and ramps open rarely; a week-old answer is still right.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getAccessibleStopsCallable = callable<{ agencyId: AgencyId }, AccessibleStops>('getAccessibleStops');
const loaded = new Map<AgencyId, Promise<AccessibleStops | null>>();

function loadAccessibleStops(agencyId: AgencyId): Promise<AccessibleStops | null> {
  const existing = loaded.get(agencyId);
  if (existing) return existing;
  const loading = (async () => {
    const cached = await readCache<AccessibleStops>(CACHE_KEY(agencyId), CACHE_MAX_AGE_MS);
    if (cached) return cached;
    const { data } = await getAccessibleStopsCallable({ agencyId });
    void writeCache(CACHE_KEY(agencyId), data);
    return data;
  })().catch(() => {
    loaded.delete(agencyId);
    return null;
  });
  loaded.set(agencyId, loading);
  return loading;
}

/** Whether a stop can be boarded from a wheelchair. */
export type IsAccessibleStop = (stopId: string | undefined) => boolean;

/**
 * Which of an agency's stops are step-free, for route view's wheelchair marks; null until known,
 * with no agency, or when `enabled` is off (Settings -> Accessibility -> Step-free routes). Also
 * null for an agency that's step-free at every stop (buses, ferries): a mark on every stop says nothing.
 */
export function useAccessibleStops(agencyId: AgencyId | undefined, enabled: boolean): IsAccessibleStop | null {
  const [answer, setAnswer] = useState<{ agencyId: AgencyId; isAccessible: IsAccessibleStop } | null>(null);
  useEffect(() => {
    if (!agencyId || !enabled) return undefined;
    let cancelled = false;
    void loadAccessibleStops(agencyId).then((stops) => {
      if (cancelled || !stops || stops.everyStop) return;
      const ids = new Set(stops.stopIds);
      setAnswer({ agencyId, isAccessible: (stopId) => stopId != null && ids.has(stopId) });
    });
    return () => {
      cancelled = true;
    };
  }, [agencyId, enabled]);
  return enabled && answer && answer.agencyId === agencyId ? answer.isAccessible : null;
}

/**
 * The names of a trip's boarding and alighting stops known not to be step-free. A leg the backend
 * couldn't match to a timetable, or an agency whose list isn't known, simply isn't flagged.
 */
export function notStepFreeStops(itinerary: Itinerary, stopsByAgency: ReadonlyMap<string, AccessibleStops>): string[] {
  const names = new Set<string>();
  for (const step of itinerary.steps) {
    if (step.kind !== 'transit' || !step.liveRoute) continue;
    const stops = stopsByAgency.get(step.liveRoute.agencyId);
    if (!stops || stops.everyStop) continue;
    if (!stops.stopIds.includes(step.liveRoute.boardStopId)) names.add(step.from.name);
    if (step.liveRoute.alightStopId && !stops.stopIds.includes(step.liveRoute.alightStopId)) names.add(step.to.name);
  }
  return [...names];
}

/** Each trip's stops without step-free access, by itinerary id; empty unless `enabled`. */
export function useNotStepFreeTrips(itineraries: readonly Itinerary[], enabled: boolean): ReadonlyMap<string, string[]> {
  const [stopsByAgency, setStopsByAgency] = useState<ReadonlyMap<string, AccessibleStops>>(new Map());
  const agencies = enabled
    ? [...new Set(itineraries.flatMap((itinerary) => itinerary.steps.flatMap((step) => (step.kind === 'transit' && step.liveRoute ? [step.liveRoute.agencyId] : []))))].sort().join(',')
    : '';
  useEffect(() => {
    if (!agencies) return undefined;
    let cancelled = false;
    void Promise.all(agencies.split(',').map(async (agencyId) => [agencyId, await loadAccessibleStops(agencyId as AgencyId)] as const)).then((answers) => {
      if (!cancelled) setStopsByAgency(new Map(answers.flatMap(([agencyId, stops]) => (stops ? [[agencyId, stops] as const] : []))));
    });
    return () => {
      cancelled = true;
    };
  }, [agencies]);
  return useMemo(() => new Map(enabled ? itineraries.flatMap((itinerary) => {
    const names = notStepFreeStops(itinerary, stopsByAgency);
    return names.length > 0 ? [[itinerary.id, names] as const] : [];
  }) : []), [enabled, itineraries, stopsByAgency]);
}

/** Test isolation only. */
export function resetAccessibleStopsForTests(): void {
  loaded.clear();
}
