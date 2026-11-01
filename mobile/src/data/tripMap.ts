import { stopRevealZoom } from './stopDeclutter';
import { subwayEntrancesAt } from './subwayEntrances';
import { formatTripClock, type Itinerary, type LatLng, type TransitStep, type TripStep } from './tripPlanning';
import { distanceMeters, type NavigationCursor, type NormalizedNavigationPlan } from './enrouteNavigation';
import type { RouteLiveVehicle } from './transitLive';
import type { TransitMode } from '../components/RouteBadge';

/** A live vehicle on one of a trip's rides, colored and drawn like that ride's line. */
export type TripVehicle = RouteLiveVehicle & { color: string; mode: TransitMode; lineKey?: string };
/** A ride's line before the rider boards, drawn faint like Route View's line behind the rider's stop. */
export type TripApproachLine = { key: string; color: string; path: readonly LatLng[] };

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
  /** Last on-route, usable evidence allowed to drive automatic follow-camera movement. */
  followLocation?: LatLng | null;
  /** Incremented by the location button; each change centers the map on `userLocation`. */
  centerOnUserRequest?: number;
  /** The rider dragged the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  /** Enroute-only route states and the next point the follow camera should keep in view. */
  navigationProgress?: TripMapProgress | null;
  /** Whether accepted location fixes should keep updating the camera. */
  followUser?: boolean;
  /** Keeps the last explicit marker but gives it a visually stale treatment. */
  userLocationStale?: boolean;
  /** Reports gesture-paused or locate-resumed follow mode. */
  onFollowModeChange?: (following: boolean) => void;
  /** The rides' live vehicles (useTripVehicles), drawn like Route View's. */
  vehicles?: readonly TripVehicle[];
  /** Each ride's line leading up to where the rider boards (useTripVehicles). */
  approachLines?: readonly TripApproachLine[];
  testID?: string;
};

export type TripMapLeg = { path: LatLng[]; walk: boolean; color?: string };
export type TripMapProgressState = 'completed' | 'current' | 'upcoming';
export type TripMapRenderSegment = TripMapLeg & {
  state: TripMapProgressState;
  stepIndex: number;
};
/** Subway entrances appear from this zoom, when a station's street corners can be told apart. */
export const ENTRANCE_REVEAL_ZOOM = 16;

/** `stop`: where the rider boards or gets off; `via`: a stop passed in between; `entrance`: a way in or out of a subway station the rider uses. */
export type TripMapStop = {
  point: LatLng;
  kind: 'start' | 'stop' | 'via' | 'end' | 'entrance';
  color?: string;
  label?: string;
  /** The transit leg a boarding, alighting, or in-between stop belongs to. */
  leg?: number;
};

export type TripMapProgressStop = TripMapStop & {
  state: TripMapProgressState;
  /** Progress never removes a stop; renderers can still apply their normal zoom decluttering. */
  visible: boolean;
};

export type TripMapProgress = {
  segments: TripMapRenderSegment[];
  stops: TripMapProgressStop[];
  followTarget: LatLng | null;
};

function closestPathIndex(path: readonly LatLng[], point: LatLng): number {
  let closest = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  path.forEach((candidate, index) => {
    const distance = distanceMeters(candidate, point);
    if (distance < closestDistance) {
      closest = index;
      closestDistance = distance;
    }
  });
  return closest;
}

/** Completed/current/upcoming route pieces and the immediate route point for follow-camera framing. */
export function navigationMapProgress(plan: NormalizedNavigationPlan, cursor: NavigationCursor): TripMapProgress {
  const segments: TripMapRenderSegment[] = [];
  const currentCheckpoint = plan.checkpoints[cursor.checkpointOrdinal];

  for (const segment of plan.segments) {
    const base = { walk: segment.kind === 'walk', color: segment.color, stepIndex: segment.stepIndex };
    if (cursor.phase === 'arrived' || cursor.checkpointOrdinal >= segment.endCheckpointOrdinal) {
      if (segment.path.length >= 2) segments.push({ ...base, path: segment.path, state: 'completed' });
      continue;
    }
    if (cursor.checkpointOrdinal < segment.startCheckpointOrdinal) {
      if (segment.path.length >= 2) segments.push({ ...base, path: segment.path, state: 'upcoming' });
      continue;
    }

    const splitIndex = currentCheckpoint ? closestPathIndex(segment.path, currentCheckpoint.point) : 0;
    const completed = segment.path.slice(0, splitIndex + 1);
    const current = segment.path.slice(splitIndex);
    if (completed.length >= 2) segments.push({ ...base, path: completed, state: 'completed' });
    if (current.length >= 2) segments.push({ ...base, path: current, state: 'current' });
  }

  const stops: TripMapProgressStop[] = plan.checkpoints.flatMap((checkpoint) => {
    if (checkpoint.kind === 'walk') return [];
    const segment = plan.segments.find((candidate) => candidate.stepIndex === checkpoint.stepIndex && candidate.kind === 'transit');
    const kind: TripMapStop['kind'] = checkpoint.kind === 'start'
      ? 'start'
      : checkpoint.kind === 'destination'
        ? 'end'
        : checkpoint.kind === 'transit-stop'
          ? 'via'
          : 'stop';
    const state: TripMapProgressState = checkpoint.ordinal < cursor.checkpointOrdinal
      ? 'completed'
      : checkpoint.ordinal === cursor.checkpointOrdinal
        ? 'current'
        : 'upcoming';
    return [{
      point: checkpoint.point,
      kind,
      color: segment?.color,
      label: checkpoint.time ? `${checkpoint.label} · ${formatTripClock(checkpoint.time)}` : checkpoint.label,
      leg: checkpoint.transitLegIndex,
      state,
      visible: true,
    }];
  });

  if (cursor.phase === 'arrived') return { segments, stops, followTarget: currentCheckpoint?.point ?? null };
  const currentSegment = plan.segments.find((segment) => cursor.checkpointOrdinal >= segment.startCheckpointOrdinal
    && cursor.checkpointOrdinal < segment.endCheckpointOrdinal);
  let followTarget: LatLng | null = null;
  if (currentSegment && currentCheckpoint && currentSegment.path.length > 0) {
    const index = closestPathIndex(currentSegment.path, currentCheckpoint.point);
    followTarget = currentSegment.path[Math.min(index + 1, currentSegment.path.length - 1)] ?? null;
  }
  followTarget ??= plan.checkpoints[cursor.checkpointOrdinal + 1]?.point ?? currentCheckpoint?.point ?? null;
  return { segments, stops, followTarget };
}

/**
 * What a trip map draws, shared by the web and native maps: one line per step (walking flagged
 * so it can be drawn dotted), a marker at the start, at every boarding and alighting point, at
 * each known stop in between, and at the destination, each labeled, and the points to frame.
 */
/** Within this (meters) a path already reaches a point; farther, the point is added to its end. */
const JOIN_METERS = 2;

/** `path`, starting at `from` and ending at `to` when it doesn't already. */
function joinEnds(path: readonly LatLng[], from?: LatLng, to?: LatLng): LatLng[] {
  const near = (a: LatLng, b: LatLng) => distanceMeters(a, b) <= JOIN_METERS;
  const joined = [...path];
  if (from && !near(from, joined[0]!)) joined.unshift(from);
  if (to && !near(to, joined.at(-1)!)) joined.push(to);
  return joined;
}

const isCurbStop = (step: TripStep | undefined): step is TransitStep => step?.kind === 'transit' && step.mode !== 'subway' && step.mode !== 'rail';

export function tripMapPoints(itinerary: Itinerary | null | undefined, origin?: LatLng | null, destination?: LatLng | null) {
  const legs: TripMapLeg[] = [];
  const stops: TripMapStop[] = [];
  const entrances = new Map<string, TripMapStop>();
  let transitIndex = 0;
  const steps = itinerary?.steps ?? [];
  steps.forEach((step, index) => {
    if (step.path.length < 2) return;
    if (step.kind === 'walk') {
      // Google's walk ends where its path does, a little off a bus stop's own point, so it's joined to
      // that dot. A station's walk is left alone: it ends at the entrance Google chose, and the dot is
      // only one point in a station with many ways in.
      const before = steps[index - 1];
      const after = steps[index + 1];
      legs.push({ path: joinEnds(step.path, isCurbStop(before) ? before.to.location : undefined, isCurbStop(after) ? after.from.location : undefined), walk: true });
    } else {
      // A ride's line is snapped to the road; it's run on to its stops' dots so it ends on them.
      legs.push({ path: joinEnds(step.path, step.from.location, step.to.location), walk: false, color: step.line.color });
      const color = step.line.color;
      const leg = transitIndex;
      transitIndex += 1;
      stops.push(
        { point: step.from.location, kind: 'stop', color, leg, label: `${step.from.name} · ${formatTripClock(step.from.time)}` },
        ...(step.stops ?? []).map((stop): TripMapStop => ({ point: stop.location, kind: 'via', color, leg, label: `${stop.name} · ${formatTripClock(stop.time)}` })),
        { point: step.to.location, kind: 'stop', color, leg, label: `${step.to.name} · ${formatTripClock(step.to.time)}` },
      );
      if (step.mode === 'subway') {
        // A transfer's two legs can share a station, whose entrances are drawn once.
        for (const entrance of [...subwayEntrancesAt(step.from.location), ...subwayEntrancesAt(step.to.location)]) {
          entrances.set(`${entrance.point.lat},${entrance.point.lng},${entrance.label}`, { point: entrance.point, kind: 'entrance', color, label: entrance.label });
        }
      }
    }
  });
  const start = itinerary?.steps[0]?.path[0] ?? origin ?? undefined;
  const end = itinerary?.steps.at(-1)?.path.at(-1) ?? destination ?? undefined;
  if (start) stops.unshift({ point: start, kind: 'start', label: 'Start' });
  if (end) stops.push({ point: end, kind: 'end', label: 'Destination' });
  const bounds = [...legs.flatMap((leg) => leg.path), ...stops.map((stop) => stop.point)];
  // After the bounds: entrances don't change how the trip is framed.
  return { legs, stops: [...stops, ...entrances.values()], bounds };
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
