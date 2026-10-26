import { useEffect, useState } from 'react';

import { callable } from '../lib/firebase';
import { readCache, writeCache } from './deviceCache';
import type { LiveSource } from './transit';

type AgencyId = LiveSource['agencyId'];

/** firebase/functions/src/accessibleStops.ts's AccessibleStops. */
type AccessibleStops = { everyStop: boolean; stopIds: string[] };

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

/** Test isolation only. */
export function resetAccessibleStopsForTests(): void {
  loaded.clear();
}
