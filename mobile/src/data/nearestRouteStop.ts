
import type { Coordinates } from '../hooks/useCurrentLocation';
import { callable } from '../lib/firebase';
import type { LiveSource } from './transit';

/** A direction's nearest stop — resolved independently of the other direction, so it's never assumed to share a station (NICE Bus/Suffolk County Transit's stops never do; LIRR's/subway's happen to). Absent if this route has no real trips in that direction at all. */
export type NearestDirectionStop = { stopId: string; name: string; lat?: number; lon?: number } | null;

export type NearestRouteStop = {
  distanceMeters: number;
  direction1: NearestDirectionStop;
  direction0: NearestDirectionStop;
};

export type NearestDirectionResponse = { stopId: string; name: string; headsign: string | null; lat?: number; lon?: number } | null;
type NearestRouteStopResponse = {
  distanceMeters: number;
  direction1: NearestDirectionResponse;
  direction0: NearestDirectionResponse;
};

/** The stop, with its position when the backend sent one (older backends don't). */
export function directionStop(stop: NearestDirectionResponse): NearestDirectionStop {
  if (!stop) return null;
  const hasPoint = typeof stop.lat === 'number' && typeof stop.lon === 'number';
  return { stopId: stop.stopId, name: stop.name, ...(hasPoint ? { lat: stop.lat, lon: stop.lon } : {}) };
}

const getNearestRouteStopCallable = callable<
  { agencyId: string; routeId: string; lat: number; lon: number },
  NearestRouteStopResponse
>('getNearestRouteStop');

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
      direction1: directionStop(data.direction1),
      direction0: directionStop(data.direction0),
    };
  } catch {
    return null;
  }
}
