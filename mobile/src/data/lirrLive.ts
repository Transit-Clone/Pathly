import { httpsCallable } from 'firebase/functions';

import { functions } from '../lib/firebase';

export type LirrVehicle = {
  tripId: string;
  directionId: number;
  lat: number;
  lon: number;
  /** When the train's GPS position was measured (epoch ms); null if the backend didn't say. */
  updatedAt: number | null;
};

export type DirectionPrediction = { minutes: number; live: boolean };

type StopPredictions = {
  /** direction_id 1. */
  towardDirection1: readonly DirectionPrediction[];
  /** direction_id 0. */
  towardDirection0: readonly DirectionPrediction[];
};

type LirrVehicleResponse = {
  tripId: string;
  directionId: number;
  lat: number;
  lon: number;
  /** Epoch seconds; absent from functions deployed before this field was added. */
  timestamp?: number | null;
};

type LirrBranchLiveStatusResponse = {
  routeId: string;
  routeName: string;
  vehicles: LirrVehicleResponse[];
  stopPredictions: StopPredictions;
};

export type LirrDirectionalPredictions = {
  /** direction_id 1. Real-time when a train is currently tracked, otherwise the real published timetable (never a placeholder) — see `live` on each entry. */
  towardDirection1: readonly DirectionPrediction[];
  /** direction_id 0. Same real-time/timetable fallback as towardDirection1. */
  towardDirection0: readonly DirectionPrediction[];
};

export type LirrBranchLiveData = {
  /** The route_id this data is for — lets callers confirm it matches the route they're about to apply it to, rather than assuming there's only ever one live branch. */
  routeId: string;
  predictions: LirrDirectionalPredictions;
  vehicles: readonly LirrVehicle[];
};

const getLirrBranchLiveStatus = httpsCallable<{ routeId: string; stopId: string }, LirrBranchLiveStatusResponse>(functions, 'getLirrBranchLiveStatus');

/**
 * Upcoming departures (both GTFS directions) and live train positions for one LIRR
 * branch/stop — parameterized rather than hardcoded to Port Jefferson/Stony Brook so other
 * branches can reuse this later; see routes.txt/stops.txt in
 * firebase/functions/static_data/lirr for valid IDs.
 */
export async function fetchLirrBranchLiveData(routeId: string, stopId: string): Promise<LirrBranchLiveData> {
  const { data } = await getLirrBranchLiveStatus({ routeId, stopId });
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
