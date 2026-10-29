import { useEffect, useMemo, useState } from 'react';

import { visibleTrains } from '../data/liveTrains';
import { distanceMeters, onPath, splitPathAtStop, type LatLon } from '../data/routeDirection';
import { fetchRouteGeometry, type RouteGeometry } from '../data/routeGeometry';
import type { LiveSource } from '../data/transit';
import { fetchRouteLiveData, type RouteLiveVehicle } from '../data/transitLive';
import { badgeMode, type Itinerary, type LatLng, type TransitStep } from '../data/tripPlanning';
import type { TripApproachLine, TripVehicle } from '../data/tripMap';
import type { TransitMode } from '../components/RouteBadge';
import { useNow } from './useNow';

/** As often as Route View's live map asks; the feeds themselves update every few seconds. */
const POLL_MS = 15_000;

type LegLine = { key: string; source: LiveSource; boardStopId: string; alight: LatLng; directionId?: number; color: string; mode: TransitMode };

/** Where a ride's vehicles still matter: the line up to the rider's stop (drawn faint), and on to where they get off. */
type LineReach = { approach: LatLon[]; upToAlighting: LatLon[] };

/** Each ride's line once, in the direction the rider travels (backend tripStops.ts `liveRoute`). */
function legLines(itinerary: Itinerary | null | undefined, fallbackColor: string): LegLine[] {
  const lines = new Map<string, LegLine>();
  for (const step of itinerary?.steps ?? []) {
    if (step.kind !== 'transit' || !step.liveRoute) continue;
    const { agencyId, routeId, boardStopId, directionId } = step.liveRoute;
    const key = `${agencyId}:${routeId}:${directionId ?? ''}`;
    if (lines.has(key)) continue;
    lines.set(key, {
      key,
      source: { agencyId: agencyId as LiveSource['agencyId'], routeId, direction1StopId: boardStopId, direction0StopId: boardStopId, direction1Index: 0 },
      boardStopId,
      alight: (step as TransitStep).to.location,
      directionId,
      color: (step as TransitStep).line.color ?? fallbackColor,
      mode: badgeMode(step),
    });
  }
  return [...lines.values()];
}

/** The ride's stretch of its line's shape: cut at the boarding stop, and at the stop after it nearest where the rider gets off. */
function lineReach(geometry: RouteGeometry, line: LegLine): LineReach | null {
  const { stops } = geometry;
  const path = geometry.path && geometry.path.length > 1 ? geometry.path : stops;
  const boardIndex = stops.findIndex((stop) => stop.stopId === line.boardStopId);
  if (boardIndex < 0) return null;
  const alight = { lat: line.alight.lat, lon: line.alight.lng };
  let alightIndex = -1;
  for (let index = boardIndex + 1; index < stops.length; index += 1) {
    if (alightIndex < 0 || distanceMeters(stops[index]!, alight) < distanceMeters(stops[alightIndex]!, alight)) alightIndex = index;
  }
  if (alightIndex < 0) return null;
  return { approach: splitPathAtStop(path, stops, boardIndex).behind, upToAlighting: splitPathAtStop(path, stops, alightIndex).behind };
}

/**
 * The live vehicles of a planned trip's rides, refreshed while the trip is on screen, so the rider
 * can watch theirs come in, and each ride's line before the boarding stop to watch it on. Only
 * vehicles still to reach the rider's stop, or carrying them, show: one past where they get off no
 * longer matters. Empty for rides with no live feed (or a backend that doesn't say which line a ride is).
 */
export function useTripVehicles(itinerary: Itinerary | null | undefined, fallbackColor: string): { vehicles: readonly TripVehicle[]; approachLines: readonly TripApproachLine[] } {
  const lines = useMemo(() => legLines(itinerary, fallbackColor), [itinerary, fallbackColor]);
  const linesKey = lines.map((line) => `${line.key}@${line.boardStopId}`).join('|');
  const [byLine, setByLine] = useState<ReadonlyMap<string, readonly RouteLiveVehicle[]>>(new Map());
  const [reaches, setReaches] = useState<ReadonlyMap<string, LineReach>>(new Map());
  const now = useNow(POLL_MS);

  useEffect(() => {
    if (lines.length === 0) return undefined;
    let cancelled = false;
    const load = () => {
      void Promise.all(lines.map((line) => fetchRouteLiveData(line.source).then((data) => [line.key, data.vehicles] as const, () => null))).then((results) => {
        if (cancelled) return;
        setByLine((current) => {
          const next = new Map(current);
          for (const result of results) if (result) next.set(result[0], result[1]);
          return next;
        });
      });
    };
    load();
    const timer = setInterval(load, POLL_MS);
    // The line's shape (cached for the session), once per ride.
    void Promise.all(lines.map((line) => (line.directionId === 0 || line.directionId === 1
      ? fetchRouteGeometry(line.source, line.directionId).then((geometry) => {
        const reach = geometry ? lineReach(geometry, line) : null;
        return reach ? ([line.key, reach] as const) : null;
      })
      : Promise.resolve(null)))).then((results) => {
      if (!cancelled) setReaches(new Map(results.filter((result) => result !== null)));
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the lines themselves, not the itinerary object
  }, [linesKey]);

  const vehicles = useMemo(
    () => lines.flatMap((line) => {
      const reach = reaches.get(line.key);
      return visibleTrains(byLine.get(line.key) ?? [], line.directionId, now)
        .filter((vehicle) => !reach || onPath(reach.upToAlighting, vehicle))
        .map((vehicle) => ({ ...vehicle, color: line.color, mode: line.mode }));
    }),
    [byLine, lines, now, reaches],
  );
  const approachLines = useMemo(
    () => lines.flatMap((line) => {
      const approach = reaches.get(line.key)?.approach;
      return approach && approach.length > 1 ? [{ key: line.key, color: line.color, path: approach.map((point) => ({ lat: point.lat, lng: point.lon })) }] : [];
    }),
    [lines, reaches],
  );
  return { vehicles, approachLines };
}
