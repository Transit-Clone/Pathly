import { useEffect, useState } from 'react';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { callable } from '../lib/firebase';
import type { LiveSource } from './transit';

export type WalkPoint = { lat: number; lon: number };

const getWalkingPathCallable = callable<
  { agencyId: string; stopId: string; lat: number; lon: number },
  { walk?: { meters: number; path: WalkPoint[] } | null }
>('getWalkingPath', (response) => ({ points: response.walk?.path.length ?? 0 }));

/**
 * The walk along the streets from the rider to a stop (the backend's walkingGraph.ts — the same
 * walk that chose the stop), or null when there's none to draw: no walking data, the stop is out
 * of walking range, an older backend without this call, or any failure. Never throws; the map
 * just shows no walk.
 */
export async function fetchWalkingPath(agencyId: LiveSource['agencyId'], stopId: string, location: Coordinates): Promise<readonly WalkPoint[] | null> {
  try {
    const { data } = await getWalkingPathCallable({ agencyId, stopId, lat: location.latitude, lon: location.longitude });
    const path = data?.walk?.path;
    return Array.isArray(path) && path.length > 1 ? path : null;
  } catch {
    return null;
  }
}

// Asked again only when the rider has moved about this far (in degrees, ~20 m), not on every GPS fix.
const LOCATION_STEP_DEGREES = 0.0002;
const stepped = (degrees: number) => Math.round(degrees / LOCATION_STEP_DEGREES);

/**
 * The walk to `stopId` for route detail's map, refetched when the stop changes or the rider moves
 * ~20 m. Null until it loads, and cleared at once when the stop changes so a stale walk never
 * points at the wrong stop.
 */
export function useWalkingPath(agencyId: LiveSource['agencyId'] | undefined, stopId: string | undefined, location: Coordinates | undefined): readonly WalkPoint[] | null {
  const [walk, setWalk] = useState<{ stopId: string; path: readonly WalkPoint[] } | null>(null);
  const latStep = location ? stepped(location.latitude) : null;
  const lonStep = location ? stepped(location.longitude) : null;
  useEffect(() => {
    if (!agencyId || !stopId || !location) return undefined;
    let cancelled = false;
    void fetchWalkingPath(agencyId, stopId, location).then((path) => {
      if (!cancelled) setWalk(path ? { stopId, path } : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ~20 m step, not every GPS fix
  }, [agencyId, stopId, latStep, lonStep]);
  return walk && walk.stopId === stopId && location ? walk.path : null;
}

/** An everyday walking pace, about 4.8 km/h (what trip planners like Google assume). */
const WALK_METERS_PER_MINUTE = 80;

/** Minutes to walk a street path (from the OpenStreetMap walking graph), rounded up; at least 1. */
export function walkingMinutes(path: readonly WalkPoint[]): number | null {
  if (path.length < 2) return null;
  let meters = 0;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]!;
    const b = path[index]!;
    meters += Math.hypot((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)), b.lat - a.lat) * 111_320;
  }
  return Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));
}
