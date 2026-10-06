import { httpsCallable } from 'firebase/functions';

import { functions } from '../lib/firebase';
import type { LiveSource } from './transit';

export type RouteLiveVehicle = {
  tripId: string;
  /** GTFS direction_id, so the map can show only the selected direction's vehicles. */
  directionId: number;
  lat: number;
  lon: number;
  /** When the vehicle's GPS position was measured (epoch ms); null if the backend didn't say. */
  updatedAt: number | null;
};
export type DirectionPrediction = {
  minutes: number;
  live: boolean;
  /** This specific trip's real LIRR peak/off-peak classification — null for agencies without fare tiers (e.g. subway's flat fare) or if it couldn't be resolved. */
  peakOffpeak: boolean | null;
};

type StopPredictions = {
  towardDirection1: readonly DirectionPrediction[];
  towardDirection0: readonly DirectionPrediction[];
};

type RouteLiveStatusResponse = {
  routeId: string;
  routeName: string;
  /** `timestamp` is epoch seconds; absent from functions deployed before it was added. */
  vehicles: { tripId: string; directionId: number; lat: number; lon: number; timestamp?: number | null }[];
  stopPredictions: StopPredictions;
};

export type RouteLiveData = {
  /** Lets callers confirm this matches the route they're about to apply it to, rather than assuming there's only ever one live route. */
  routeId: string;
  predictions: {
    /** direction_id 1. Real-time when a vehicle is currently tracked; for agencies where it's reliable (see backend's gtfsAgencies.ts), otherwise padded with the real published timetable (never a placeholder) — see `live` on each entry. */
    towardDirection1: readonly DirectionPrediction[];
    /** direction_id 0. Same real-time/timetable fallback as towardDirection1. */
    towardDirection0: readonly DirectionPrediction[];
  };
  vehicles: readonly RouteLiveVehicle[];
};

const getRouteLiveStatus = httpsCallable<
  { agencyId: string; routeId: string; direction1StopId: string; direction0StopId: string },
  RouteLiveStatusResponse
>(functions, 'getRouteLiveStatus');

/**
 * Upcoming departures (both directions) and live vehicle positions for one route on any
 * configured agency (LIRR, NYC Subway, ...) — one function for every agency rather than one
 * per agency, since the backend already unifies them behind a single callable. For agencies
 * where one stop_id serves a station regardless of direction, `source.direction1StopId` and
 * `.direction0StopId` are the same value.
 */
export async function fetchRouteLiveData(source: LiveSource): Promise<RouteLiveData> {
  const { data } = await getRouteLiveStatus({
    agencyId: source.agencyId,
    routeId: source.routeId,
    direction1StopId: source.direction1StopId,
    direction0StopId: source.direction0StopId,
  });
  return {
    routeId: data.routeId,
    predictions: {
      towardDirection1: data.stopPredictions.towardDirection1,
      towardDirection0: data.stopPredictions.towardDirection0,
    },
    vehicles: data.vehicles.map((vehicle) => ({
      tripId: vehicle.tripId,
      directionId: vehicle.directionId,
      lat: vehicle.lat,
      lon: vehicle.lon,
      updatedAt: vehicle.timestamp != null ? vehicle.timestamp * 1000 : null,
    })),
  };
}
