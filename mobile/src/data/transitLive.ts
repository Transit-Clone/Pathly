import { httpsCallable } from 'firebase/functions';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { functions } from '../lib/firebase';
import type { NearestRouteStop } from './nearestRouteStop';
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
  /** When this data was fetched (epoch ms), so countdowns can be aged between polls. */
  fetchedAt: number;
  /**
   * The nearest stop the backend resolved from the rider's location in the same call;
   * `undefined` (not null) when the deployed backend predates that, so callers can fall back.
   */
  nearestStop?: NearestRouteStop | null;
};

type NearestStopResponse = {
  distanceMeters: number;
  direction1: { stopId: string; name: string } | null;
  direction0: { stopId: string; name: string } | null;
} | null;

const getRouteLiveStatus = httpsCallable<
  { agencyId: string; routeId: string; direction1StopId: string; direction0StopId: string; lat?: number; lon?: number },
  RouteLiveStatusResponse & { nearestStop?: NearestStopResponse }
>(functions, 'getRouteLiveStatus');

/**
 * Upcoming departures (both directions) and live vehicle positions for one route on any
 * configured agency (LIRR, NYC Subway, ...) — one function for every agency rather than one
 * per agency, since the backend already unifies them behind a single callable. For agencies
 * where one stop_id serves a station regardless of direction, `source.direction1StopId` and
 * `.direction0StopId` are the same value.
 */
export async function fetchRouteLiveData(source: LiveSource, location?: Coordinates): Promise<RouteLiveData> {
  const { data } = await getRouteLiveStatus({
    ...routeRequest(source),
    ...(location ? { lat: location.latitude, lon: location.longitude } : {}),
  });
  return toRouteLiveData(data);
}

type RouteRequest = { agencyId: string; routeId: string; direction1StopId: string; direction0StopId: string };

function routeRequest(source: LiveSource): RouteRequest {
  return {
    agencyId: source.agencyId,
    routeId: source.routeId,
    direction1StopId: source.direction1StopId,
    direction0StopId: source.direction0StopId,
  };
}

/** The most routes the backend answers in one batch (getRoutesLiveStatus's MAX_BATCH_ROUTES). */
export const MAX_BATCH_ROUTES = 12;

const getRoutesLiveStatus = httpsCallable<
  { routes: RouteRequest[]; lat?: number; lon?: number },
  { results: ({ ok: true; data: RouteLiveStatusResponse & { nearestStop?: NearestStopResponse } } | { ok: false; code: string })[] }
>(functions, 'getRoutesLiveStatus');

/** Thrown when the deployed backend predates batching, so callers can fall back to one request per route. */
export class BatchUnavailableError extends Error {}

/**
 * Live status for up to MAX_BATCH_ROUTES routes in one request: every card on screen waits in the
 * backend's one-at-a-time live-status queue once, not once per card. Each entry is that route's
 * data, or null if that route alone failed.
 */
export async function fetchRoutesLiveData(sources: readonly LiveSource[], location?: Coordinates): Promise<(RouteLiveData | null)[]> {
  try {
    const { data } = await getRoutesLiveStatus({
      routes: sources.map(routeRequest),
      ...(location ? { lat: location.latitude, lon: location.longitude } : {}),
    });
    return sources.map((_, index) => {
      const result = data.results[index];
      return result?.ok ? toRouteLiveData(result.data) : null;
    });
  } catch (error) {
    // A backend deployed before batching has no such function.
    if ((error as { code?: string } | null)?.code === 'functions/not-found') throw new BatchUnavailableError();
    throw error;
  }
}

function toRouteLiveData(data: RouteLiveStatusResponse & { nearestStop?: NearestStopResponse }): RouteLiveData {
  const nearest = data.nearestStop;
  return {
    routeId: data.routeId,
    fetchedAt: Date.now(),
    ...(nearest !== undefined
      ? {
        nearestStop: nearest
          ? {
            distanceMeters: nearest.distanceMeters,
            direction1: nearest.direction1 ? { stopId: nearest.direction1.stopId, name: nearest.direction1.name } : null,
            direction0: nearest.direction0 ? { stopId: nearest.direction0.stopId, name: nearest.direction0.name } : null,
          }
          : null,
      }
      : {}),
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

const getStopDeparturesCallable = httpsCallable<
  { agencyId: string; routeId: string; direction1StopId: string; direction0StopId: string; directionId: 0 | 1 },
  { departures: DirectionPrediction[] }
>(functions, 'getStopDepartures');

/**
 * Every remaining departure today (plus the next service day's first ones late at night) from
 * the given stops in one GTFS direction — the "More departures" page. Not cached: the page
 * refetches each time it opens.
 */
export async function fetchStopDepartures(source: LiveSource, directionId: 0 | 1): Promise<readonly DirectionPrediction[]> {
  const { data } = await getStopDeparturesCallable({
    agencyId: source.agencyId,
    routeId: source.routeId,
    direction1StopId: source.direction1StopId,
    direction0StopId: source.direction0StopId,
    directionId,
  });
  return data.departures;
}
