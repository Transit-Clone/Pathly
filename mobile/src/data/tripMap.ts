import { stopRevealZoom } from './stopDeclutter';
import { formatTripClock, type Itinerary, type LatLng } from './tripPlanning';

export type TripMapProps = {
  /** The planned trip; omitted while results load, when only the endpoints are shown. */
  itinerary?: Itinerary | null;
  origin?: LatLng | null;
  destination?: LatLng | null;
  padding?: { top: number; right: number; bottom: number; left: number };
  /** Pan and zoom by gesture, tap stops for their name and time, and re-frame the trip. */
  interactive?: boolean;
  /** Centers the map on a stop and shows its label; a new `key` repeats it for the same stop. */
  focusStop?: { point: LatLng; key: number } | null;
  /** The rider's real position: drawn on the map, and what the location button centers on. */
  userLocation?: LatLng | null;
  /** Incremented by the location button; each change centers the map on `userLocation`. */
  centerOnUserRequest?: number;
  /** The rider dragged the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  testID?: string;
};

export type TripMapLeg = { path: LatLng[]; walk: boolean; color?: string };
/** `stop`: where the rider boards or gets off; `via`: a stop passed in between. */
export type TripMapStop = {
  point: LatLng;
  kind: 'start' | 'stop' | 'via' | 'end';
  color?: string;
  label?: string;
  /** The transit leg a boarding, alighting, or in-between stop belongs to. */
  leg?: number;
};

/**
 * What a trip map draws, shared by the web and native maps: one line per step (walking flagged
 * so it can be drawn dotted), a marker at the start, at every boarding and alighting point, at
 * each known stop in between, and at the destination, each labeled, and the points to frame.
 */
export function tripMapPoints(itinerary: Itinerary | null | undefined, origin?: LatLng | null, destination?: LatLng | null) {
  const legs: TripMapLeg[] = [];
  const stops: TripMapStop[] = [];
  let transitIndex = 0;
  for (const step of itinerary?.steps ?? []) {
    if (step.path.length < 2) continue;
    if (step.kind === 'walk') {
      legs.push({ path: step.path, walk: true });
    } else {
      legs.push({ path: step.path, walk: false, color: step.line.color });
      const color = step.line.color;
      const leg = transitIndex;
      transitIndex += 1;
      stops.push(
        { point: step.from.location, kind: 'stop', color, leg, label: `${step.from.name} · ${formatTripClock(step.from.time)}` },
        ...(step.stops ?? []).map((stop): TripMapStop => ({ point: stop.location, kind: 'via', color, leg, label: `${stop.name} · ${formatTripClock(stop.time)}` })),
        { point: step.to.location, kind: 'stop', color, leg, label: `${step.to.name} · ${formatTripClock(step.to.time)}` },
      );
    }
  }
  const start = itinerary?.steps[0]?.path[0] ?? origin ?? undefined;
  const end = itinerary?.steps.at(-1)?.path.at(-1) ?? destination ?? undefined;
  if (start) stops.unshift({ point: start, kind: 'start', label: 'Start' });
  if (end) stops.push({ point: end, kind: 'end', label: 'Destination' });
  const bounds = [...legs.flatMap((leg) => leg.path), ...stops.map((stop) => stop.point)];
  return { legs, stops, bounds };
}

/** The marker drawn for a stop the rider asked to see (from the stop list): the one at that point. */
export function stopIndexAt(stops: readonly TripMapStop[], point: LatLng): number {
  return stops.findIndex((stop) => stop.point.lat === point.lat && stop.point.lng === point.lng);
}

/**
 * Per transit leg, the zoom from which its stops in between are drawn (stopDeclutter.ts): each
 * leg's own stops decide, so a crowded spot elsewhere on the trip (two platforms at a transfer)
 * doesn't hold back a leg whose stops are well spaced.
 */
export function viaRevealZooms(stops: readonly TripMapStop[]): Map<number, number> {
  const byLeg = new Map<number, LatLng[]>();
  for (const stop of stops) {
    if (stop.leg === undefined || (stop.kind !== 'via' && stop.kind !== 'stop')) continue;
    const points = byLeg.get(stop.leg);
    if (points) points.push(stop.point);
    else byLeg.set(stop.leg, [stop.point]);
  }
  return new Map([...byLeg].map(([leg, points]) => [leg, stopRevealZoom(points)]));
}
