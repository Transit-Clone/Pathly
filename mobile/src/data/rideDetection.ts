import { distanceMeters } from './rideGeometry';

/**
 * Decides, on this device, whether a rider is really on one of a line's vehicles. Standing on a
 * platform beside a train, or waiting at a stop as a bus pulls in, must never count, so a ride
 * starts only once the rider and the vehicle have both travelled the same way for a while. It ends
 * as soon as they part, GPS going bad simply adds no evidence (a subway tunnel lets the session
 * lapse on the backend), and all positions compared are the agency feed's, never one riders moved.
 */
export const MAX_FIX_ACCURACY_METERS = 100;
const CONFIRM_SAMPLES = 3;
const CONFIRM_MS = 90_000;
const MIN_RIDER_TRAVEL_METERS = 200;
const MIN_VEHICLE_TRAVEL_METERS = 100;
const MISSES_TO_END = 2;

export type RideFix = { at: number; lat: number; lon: number; accuracyMeters: number | null };
export type FeedVehicle = { tripId: string; lat: number; lon: number; updatedAt: number | null };
type Point = { lat: number; lon: number };

export type RideState =
  | { phase: 'idle' }
  | { phase: 'candidate'; tripId: string; since: number; samples: number; riderStart: Point; vehicleStart: Point }
  | { phase: 'riding'; tripId: string; misses: number };

export const IDLE_RIDE: RideState = { phase: 'idle' };

/** Mirrors the backend's maxRiderGapMeters (rideSessions.ts), which has the final say. */
export function maxGapMeters(vehicle: FeedVehicle, now: number): number {
  const ageSeconds = vehicle.updatedAt != null ? (now - vehicle.updatedAt) / 1000 : 60;
  return 200 + 30 * Math.min(Math.max(0, ageSeconds), 60);
}

export function nearRider(vehicle: FeedVehicle, fix: Point, now: number): boolean {
  return distanceMeters(vehicle, fix) <= maxGapMeters(vehicle, now);
}

/** The next state after one GPS fix. `dismissed` trips ("I'm not on this") are never picked. */
export function nextRideState(state: RideState, fix: RideFix, vehicles: readonly FeedVehicle[], dismissed: ReadonlySet<string>): RideState {
  if (fix.accuracyMeters == null || fix.accuracyMeters > MAX_FIX_ACCURACY_METERS) return state;

  if (state.phase === 'riding') {
    const vehicle = vehicles.find((candidate) => candidate.tripId === state.tripId);
    if (vehicle && nearRider(vehicle, fix, fix.at)) return state.misses === 0 ? state : { ...state, misses: 0 };
    return state.misses + 1 >= MISSES_TO_END ? IDLE_RIDE : { ...state, misses: state.misses + 1 };
  }

  const nearest = vehicles
    .filter((vehicle) => !dismissed.has(vehicle.tripId) && nearRider(vehicle, fix, fix.at))
    .sort((a, b) => distanceMeters(a, fix) - distanceMeters(b, fix))[0];
  if (!nearest) return IDLE_RIDE;
  const current = state.phase === 'candidate' && state.tripId === nearest.tripId ? state : null;
  if (!current) return { phase: 'candidate', tripId: nearest.tripId, since: fix.at, samples: 1, riderStart: fix, vehicleStart: nearest };

  const samples = current.samples + 1;
  const riderEast = fix.lon - current.riderStart.lon;
  const riderNorth = fix.lat - current.riderStart.lat;
  const vehicleEast = nearest.lon - current.vehicleStart.lon;
  const vehicleNorth = nearest.lat - current.vehicleStart.lat;
  const confirmed = samples >= CONFIRM_SAMPLES
    && fix.at - current.since >= CONFIRM_MS
    && distanceMeters(current.riderStart, fix) >= MIN_RIDER_TRAVEL_METERS
    && distanceMeters(current.vehicleStart, nearest) >= MIN_VEHICLE_TRAVEL_METERS
    && riderEast * vehicleEast + riderNorth * vehicleNorth > 0;
  return confirmed ? { phase: 'riding', tripId: nearest.tripId, misses: 0 } : { ...current, samples };
}
