import { distanceMeters } from './enrouteNavigation';
import type { RouteNotice } from './routeNotices';
import type { RoutePrediction, ServiceAlert } from './transit';
import type { Itinerary, LatLng, TransitStep, TripMode, TripStep } from './tripPlanning';

/**
 * Route View's GO: one line, ridden from the rider's stop to a stop they pick, in the shape of a
 * planned trip (an `Itinerary`), so the Trip Details page and en-route navigation show it as they
 * would any trip. Everything comes from what Route View already has: the line's stops in this
 * direction with their minutes apart, its upcoming departures from the rider's stop, and the walk
 * there.
 */

/** A stop on the line, from the rider's (boarding) stop onward; `offsetMinutes` from the line's start. */
export type RideGuideStop = { name: string; stopId?: string; lat: number; lon: number; offsetMinutes: number };

/** Everything the GO view needs, captured from Route View when GO is pressed. */
export type RideGuideRequest = {
  /** The route's id (Route View's `route.id`), to go back to it. */
  routeId: string;
  /** Route View's `directions` index, to return to the same direction. */
  directionIndex: number;
  agency: string;
  agencyId?: string;
  routeIdAtAgency?: string;
  /** GTFS direction_id of the shown direction, for the live vehicles on the map. */
  directionId?: 0 | 1;
  mode: TripMode | 'ferry';
  routeName: string;
  shortName: string;
  color: string;
  textColor?: string;
  /** Where this direction goes: "Port Jefferson". */
  headsign: string;
  /** Boarding stop first. At least two. */
  stops: readonly RideGuideStop[];
  /** The line's drawn shape for this direction, when known. */
  path?: readonly { lat: number; lon: number }[];
  /** Upcoming departures from the boarding stop, soonest first (minutes from `capturedAt`). */
  departures: readonly RoutePrediction[];
  /** Which of `departures` Route View had picked. */
  selectedDeparture: number;
  /** The walk to the boarding stop, when Route View knows it. */
  walk?: { minutes: number; path: readonly { lat: number; lon: number }[] } | null;
  /** Route View's alerts and coming-up notices for this line (delays left to the departure's own note). */
  notices: readonly RouteNotice[];
  /** When the departures' minutes were counted from (ms). */
  capturedAt: number;
};

const MINUTE_MS = 60_000;
const toLatLng = (point: { lat: number; lon: number }): LatLng => ({ lat: point.lat, lng: point.lon });
const iso = (ms: number) => new Date(ms).toISOString();

function pathLength(path: readonly LatLng[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += distanceMeters(path[index - 1]!, path[index]!);
  return total;
}

function nearestIndex(path: readonly LatLng[], point: LatLng, from = 0): number {
  let best = from;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = from; index < path.length; index += 1) {
    const distance = distanceMeters(path[index]!, point);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The line's shape between two of its stops: the drawn path cut at the points nearest each, or
 * straight from stop to stop when there's no path (or it doesn't run between them in order).
 */
export function ridePath(stops: readonly RideGuideStop[], path: readonly { lat: number; lon: number }[] | undefined): LatLng[] {
  const stopPoints = stops.map(toLatLng);
  if (!path || path.length < 2 || stopPoints.length < 2) return stopPoints;
  const shape = path.map(toLatLng);
  const start = nearestIndex(shape, stopPoints[0]!);
  const end = nearestIndex(shape, stopPoints.at(-1)!, start);
  if (end <= start) return stopPoints;
  return [stopPoints[0]!, ...shape.slice(start, end + 1), stopPoints.at(-1)!];
}

/** Route View's notices as Trip Details' leg alerts; delays are the departure's own note instead. */
export function rideAlerts(notices: readonly RouteNotice[]): ServiceAlert[] {
  return notices
    .filter((notice) => notice.kind !== 'delay')
    .map((notice, index) => ({
      id: `${notice.kind}-${index}`,
      header: notice.title,
      description: notice.detail,
      label: notice.label,
      warning: notice.warning,
      ...(notice.kind === 'outlook' ? { upcoming: true } : {}),
    }));
}

/**
 * The ride as a one-leg trip to `stops[alightIndex]`, leaving on the picked departure (any other
 * departure is offered in the leg's departure box), after the walk to the stop when known.
 * Null when there's no departure or no stop after the boarding one.
 */
export function rideGuideItinerary(request: RideGuideRequest, alightIndex: number): Itinerary | null {
  const { capturedAt, departures, stops } = request;
  const lastIndex = Math.min(Math.max(1, alightIndex), stops.length - 1);
  const board = stops[0];
  const alight = stops[lastIndex];
  const picked = departures[request.selectedDeparture] ?? departures[0];
  if (!board || !alight || lastIndex < 1 || !picked) return null;

  const rideMs = Math.max(0, alight.offsetMinutes - board.offsetMinutes) * MINUTE_MS;
  const departsAt = (prediction: RoutePrediction) => capturedAt + Math.max(0, prediction.minutes) * MINUTE_MS;
  const stopTime = (start: number, stop: RideGuideStop) => iso(start + Math.max(0, stop.offsetMinutes - board.offsetMinutes) * MINUTE_MS);
  const between = stops.slice(1, lastIndex);
  const start = departsAt(picked);

  const transit: TransitStep = {
    kind: 'transit',
    mode: request.mode,
    agency: { name: request.agency },
    line: { name: request.routeName, shortName: request.shortName, color: request.color, ...(request.textColor ? { textColor: request.textColor } : {}) },
    headsign: request.headsign,
    from: { name: board.name, location: toLatLng(board), time: iso(start) },
    to: { name: alight.name, location: toLatLng(alight), time: iso(start + rideMs) },
    stopCount: lastIndex,
    durationSeconds: rideMs / 1000,
    path: ridePath(stops.slice(0, lastIndex + 1), request.path),
    stops: between.map((stop) => ({ name: stop.name, location: toLatLng(stop), time: stopTime(start, stop) })),
    departures: departures.map((prediction) => {
      const leaves = departsAt(prediction);
      return { departs: iso(leaves), arrives: iso(leaves + rideMs), stopTimes: between.map((stop) => stopTime(leaves, stop)) };
    }),
    ...(request.agencyId && request.routeIdAtAgency && board.stopId ? {
      liveRoute: {
        agencyId: request.agencyId,
        routeId: request.routeIdAtAgency,
        boardStopId: board.stopId,
        ...(alight.stopId ? { alightStopId: alight.stopId } : {}),
        ...(request.directionId !== undefined ? { directionId: request.directionId } : {}),
      },
    } : {}),
    ...(picked.live ? { live: { status: 'tracked' as const, ...(picked.delayMinutes != null ? { delaySeconds: picked.delayMinutes * 60 } : {}) } } : {}),
    ...(request.notices.some((notice) => notice.kind !== 'delay') ? { alerts: rideAlerts(request.notices) } : {}),
  };

  const steps: TripStep[] = [];
  const walk = request.walk && request.walk.path.length >= 2 ? request.walk : null;
  const walkMs = walk ? walk.minutes * MINUTE_MS : 0;
  if (walk) {
    const walkPath = walk.path.map(toLatLng);
    steps.push({ kind: 'walk', durationSeconds: walk.minutes * 60, distanceMeters: Math.round(pathLength(walkPath)), toName: board.name, path: walkPath });
  }
  steps.push(transit);

  const departureTime = iso(start - walkMs);
  const arrivalTime = transit.to.time;
  return {
    id: `ride:${request.routeId}:${request.directionIndex}:${board.stopId ?? board.name}:${alight.stopId ?? alight.name}`,
    departureTime,
    arrivalTime,
    durationSeconds: (Date.parse(arrivalTime) - Date.parse(departureTime)) / 1000,
    transfers: 0,
    steps,
  };
}

/** Each stop after the boarding one with when the ride gets there, for the "Getting off at" list. */
export function rideStopTimes(request: RideGuideRequest, departsIso: string): { stop: RideGuideStop; index: number; arrives: string }[] {
  const board = request.stops[0];
  if (!board) return [];
  const start = Date.parse(departsIso);
  return request.stops.slice(1).map((stop, offset) => ({
    stop,
    index: offset + 1,
    arrives: iso(start + Math.max(0, stop.offsetMinutes - board.offsetMinutes) * MINUTE_MS),
  }));
}
