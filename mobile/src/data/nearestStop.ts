import type { Coordinates } from '../hooks/useCurrentLocation';
import { PORT_JEFFERSON_STOPS } from './portJeffersonGeometry';

export type LiveStop = (typeof PORT_JEFFERSON_STOPS)[number];

/** Rough metres per degree; fine for ranking stations a few km apart around 40.8°N. */
const METRES_PER_DEGREE_LAT = 110_540;
const METRES_PER_DEGREE_LON = 111_320 * Math.cos((40.8 * Math.PI) / 180);

function distanceMetres(from: Coordinates, stop: { lat: number; lon: number }) {
  const dy = (stop.lat - from.latitude) * METRES_PER_DEGREE_LAT;
  const dx = (stop.lon - from.longitude) * METRES_PER_DEGREE_LON;
  return Math.hypot(dx, dy);
}

/** The Port Jefferson Branch station closest to `location` (straight-line distance). */
export function nearestPortJeffersonStop(location: Coordinates): LiveStop {
  let nearest: LiveStop = PORT_JEFFERSON_STOPS[0];
  let nearestDistance = Infinity;
  for (const stop of PORT_JEFFERSON_STOPS) {
    const distance = distanceMetres(location, stop);
    if (distance < nearestDistance) {
      nearest = stop;
      nearestDistance = distance;
    }
  }
  return nearest;
}
