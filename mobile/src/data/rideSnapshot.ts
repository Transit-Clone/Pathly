import {
  createTripSelectionIdentity,
  sameTripSelection,
  type TripEndpointReference,
  type TripSelectionIdentity,
} from './enrouteNavigation';
import type { Itinerary, LatLng, ResumePlanRequest, TransitStep, TripStop, WalkStep } from './tripPlanning';

/** Active-only geometry for the one-line ride assembled by Pathly's Ride Guide. */
export type RideSnapshotV1 = { version: 1; itinerary: Itinerary };

type SnapshotContext = {
  origin: TripEndpointReference;
  destination: TripEndpointReference;
  request: ResumePlanRequest;
  selection: TripSelectionIdentity;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const optionalText = (value: unknown): value is string | undefined => value === undefined || typeof value === 'string';
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const time = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
const modes = new Set(['bus', 'rail', 'subway', 'ferry', 'other']);

function point(value: unknown): value is LatLng {
  return record(value)
    && typeof value.lat === 'number' && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
    && typeof value.lng === 'number' && Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180;
}

const samePoint = (left: LatLng, right: LatLng) => left.lat === right.lat && left.lng === right.lng;

function path(value: unknown): LatLng[] | null {
  return Array.isArray(value) && value.length >= 2 && value.every(point)
    ? value.map(({ lat, lng }) => ({ lat, lng }))
    : null;
}

function stop(value: unknown): TripStop | null {
  return record(value) && text(value.name) && point(value.location) && time(value.time)
    ? { name: value.name, location: { lat: value.location.lat, lng: value.location.lng }, time: value.time }
    : null;
}

function walk(value: unknown): WalkStep | null {
  if (!record(value) || value.kind !== 'walk' || !nonnegative(value.durationSeconds)
    || !nonnegative(value.distanceMeters) || !text(value.toName)) return null;
  const geometry = path(value.path);
  return geometry ? { kind: 'walk', durationSeconds: value.durationSeconds, distanceMeters: value.distanceMeters, toName: value.toName, path: geometry } : null;
}

function transit(value: unknown): TransitStep | null {
  if (!record(value) || value.kind !== 'transit'
    || typeof value.mode !== 'string' || !modes.has(value.mode)
    || !record(value.agency) || !text(value.agency.name)
    || !record(value.line) || !text(value.line.name)
    || !optionalText(value.line.shortName) || !optionalText(value.line.color)
    || !optionalText(value.line.textColor) || !optionalText(value.line.vehicleName)
    || !optionalText(value.headsign) || !optionalText(value.tripId)
    || !Number.isSafeInteger(value.stopCount) || (value.stopCount as number) < 1
    || !nonnegative(value.durationSeconds)) return null;
  const geometry = path(value.path);
  const from = stop(value.from);
  const to = stop(value.to);
  if (!geometry || !from || !to || Date.parse(from.time) > Date.parse(to.time)
    || Math.abs(Date.parse(to.time) - Date.parse(from.time) - value.durationSeconds * 1000) > 1) return null;

  let stops: TripStop[] | undefined;
  if (value.stops !== undefined) {
    if (!Array.isArray(value.stops)) return null;
    const parsed = value.stops.map(stop);
    if (parsed.some((item) => item === null)) return null;
    stops = parsed as TripStop[];
    let previousTime = Date.parse(from.time);
    for (const intermediate of stops) {
      const at = Date.parse(intermediate.time);
      if (at < previousTime || at > Date.parse(to.time)) return null;
      previousTime = at;
    }
  }

  let liveRoute: TransitStep['liveRoute'];
  if (value.liveRoute !== undefined) {
    const live = value.liveRoute;
    if (!record(live) || !text(live.agencyId) || !text(live.routeId) || !text(live.boardStopId)
      || !optionalText(live.alightStopId)
      || (live.directionId !== undefined && live.directionId !== 0 && live.directionId !== 1)) return null;
    liveRoute = {
      agencyId: live.agencyId, routeId: live.routeId, boardStopId: live.boardStopId,
      ...(live.alightStopId !== undefined ? { alightStopId: live.alightStopId } : {}),
      ...(live.directionId !== undefined ? { directionId: live.directionId } : {}),
    };
  }

  // Persist selected navigation evidence, not alternate departures or stale live/alert/fare state.
  return {
    kind: 'transit', mode: value.mode as TransitStep['mode'], agency: { name: value.agency.name },
    line: {
      name: value.line.name,
      ...(value.line.shortName !== undefined ? { shortName: value.line.shortName } : {}),
      ...(value.line.color !== undefined ? { color: value.line.color } : {}),
      ...(value.line.textColor !== undefined ? { textColor: value.line.textColor } : {}),
      ...(value.line.vehicleName !== undefined ? { vehicleName: value.line.vehicleName } : {}),
    },
    ...(value.headsign !== undefined ? { headsign: value.headsign } : {}),
    ...(value.tripId !== undefined ? { tripId: value.tripId } : {}),
    from, to, stopCount: value.stopCount as number, durationSeconds: value.durationSeconds, path: geometry,
    ...(stops === undefined ? {} : { stops }),
    ...(liveRoute ? { liveRoute } : {}),
  };
}

/** Validates a selected local ride against its owner record and removes mutable provider fields. */
export function parseRideSnapshot(value: unknown, context: SnapshotContext): RideSnapshotV1 | null {
  if (!record(value) || value.version !== 1 || !record(value.itinerary)) return null;
  const saved = value.itinerary;
  if (!text(saved.id) || !saved.id.startsWith('ride:')
    || !time(saved.departureTime) || !time(saved.arrivalTime)
    || !nonnegative(saved.durationSeconds) || saved.transfers !== 0
    || !Array.isArray(saved.steps) || saved.steps.length < 1 || saved.steps.length > 2) return null;
  const leg = transit(saved.steps.at(-1));
  const approach = saved.steps.length === 2 ? walk(saved.steps[0]) : undefined;
  if (!leg || approach === null || (approach && approach.toName !== leg.from.name)) return null;
  const departs = Date.parse(saved.departureTime);
  const arrives = Date.parse(saved.arrivalTime);
  if (arrives < departs || saved.arrivalTime !== leg.to.time
    || Math.abs(Date.parse(leg.from.time) - (approach?.durationSeconds ?? 0) * 1000 - departs) > 1
    || Math.abs(arrives - departs - saved.durationSeconds * 1000) > 1) return null;
  if (context.origin.kind !== 'coordinate' || context.destination.kind !== 'coordinate'
    || !samePoint(context.origin.point, approach?.path[0] ?? leg.from.location)
    || !samePoint(context.destination.point, leg.to.location)
    || context.destination.label !== leg.to.name
    || context.request.time.mode !== 'depart' || context.request.time.at !== saved.departureTime) return null;

  const itinerary: Itinerary = {
    id: saved.id, departureTime: saved.departureTime, arrivalTime: saved.arrivalTime,
    durationSeconds: saved.durationSeconds, transfers: 0, steps: approach ? [approach, leg] : [leg],
  };
  return sameTripSelection(context.selection, createTripSelectionIdentity(itinerary))
    ? { version: 1, itinerary }
    : null;
}
