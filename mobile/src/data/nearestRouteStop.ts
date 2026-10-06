import { httpsCallable } from 'firebase/functions';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { functions } from '../lib/firebase';
import type { LiveSource } from './transit';

/** A direction's nearest stop — resolved independently of the other direction, so it's never assumed to share a station (NICE Bus/Suffolk County Transit's stops never do; LIRR's/subway's happen to). Absent if this route has no real trips in that direction at all. */
export type NearestDirectionStop = { stopId: string; name: string } | null;

export type NearestRouteStop = {
  distanceMeters: number;
  direction1: NearestDirectionStop;
  direction0: NearestDirectionStop;
};

type NearestRouteStopResponse = {
  distanceMeters: number;
  direction1: { stopId: string; name: string; headsign: string | null } | null;
  direction0: { stopId: string; name: string; headsign: string | null } | null;
};

const getNearestRouteStopCallable = httpsCallable<
  { agencyId: string; routeId: string; lat: number; lon: number },
  NearestRouteStopResponse
>(functions, 'getNearestRouteStop');

/**
 * Whichever stop *on this specific route* is actually closest to the rider right now, resolved
 * separately for each direction — e.g. which Port Jefferson Branch station is nearest, not
 * always Stony Brook. Used to override a route's static `liveSource` stop ids (and displayed
 * stop name) so a card follows the rider as they move instead of anchoring to one hand-picked
 * station. The two directions can be genuinely different real stops (not just the same station's
 * other platform) — see getNearestStopForRoute's own comment for why this can't assume otherwise.
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
      distanceMeters: data.distanceMeters,
      direction1: data.direction1 ? { stopId: data.direction1.stopId, name: data.direction1.name } : null,
      direction0: data.direction0 ? { stopId: data.direction0.stopId, name: data.direction0.name } : null,
    };
  } catch {
    return null;
  }
}
