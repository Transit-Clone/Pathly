import { httpsCallable } from 'firebase/functions';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { functions } from '../lib/firebase';
import type { LiveSource } from './transit';

export type NearestRouteStop = {
  /** The physical station's own id (parent station for a directional-stop agency like the subway) — matches a RouteGeometry stop's `stopId` exactly, so the nearest stop can be matched reliably by id rather than by display name (which can differ in formatting between this real GTFS name and a route's hand-authored illustrative stop list). */
  stopId: string;
  stopName: string;
  distanceMeters: number;
  direction1StopId: string | null;
  direction0StopId: string | null;
};

type NearestRouteStopResponse = {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  direction1: { headsign: string | null; stopId: string | null };
  direction0: { headsign: string | null; stopId: string | null };
};

const getNearestRouteStopCallable = httpsCallable<
  { agencyId: string; routeId: string; lat: number; lon: number },
  NearestRouteStopResponse
>(functions, 'getNearestRouteStop');

/**
 * Whichever stop *on this specific route* is actually closest to the rider right now — e.g.
 * which Port Jefferson Branch station is nearest, not always Stony Brook. Used to override a
 * route's static `liveSource` stop ids (and displayed stop name) so a card follows the rider as
 * they move instead of anchoring to one hand-picked station.
 */
export async function fetchNearestRouteStop(
  source: Pick<LiveSource, 'agencyId' | 'routeId'>,
  location: Coordinates,
): Promise<NearestRouteStop | null> {
  try {
    const { data } = await getNearestRouteStopCallable({
      agencyId: source.agencyId,
      routeId: source.routeId,
      lat: location.latitude,
      lon: location.longitude,
    });
    return {
      stopId: data.stopId,
      stopName: data.name,
      distanceMeters: data.distanceMeters,
      direction1StopId: data.direction1.stopId,
      direction0StopId: data.direction0.stopId,
    };
  } catch {
    return null;
  }
}
