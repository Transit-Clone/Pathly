import { agencyConfig, type AgencyId } from './gtfsAgencies';
import { fetchFeedEntities } from './gtfsRealtime';
import { loadAgencyStaticData } from './gtfsStaticData';

export type GtfsStopStatus = {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  sequence: number;
  scheduledTime: string | null;
  delaySeconds: number | null;
};

export type GtfsTripStatus = {
  tripId: string;
  directionId: number;
  /** This trip's real LIRR peak/off-peak classification (trips.txt), resolved by trip_id — null for agencies without one, or if this live trip_id has no static match. */
  peakOffpeak: boolean | null;
  stops: GtfsStopStatus[];
};

export type GtfsVehicleStatus = {
  tripId: string;
  directionId: number;
  lat: number;
  lon: number;
  currentStatus: string | null;
  stopId: string | null;
};

export type GtfsRouteStatus = {
  routeId: string;
  routeName: string;
  trips: GtfsTripStatus[];
  vehicles: GtfsVehicleStatus[];
};

/**
 * Live trip updates and vehicle positions for one route on any configured agency (stop
 * names/coordinates resolved via that agency's static GTFS data, delays from its real-time
 * feed) — the same logic regardless of agency; only the feed request(s) and static data
 * directory differ, both read from gtfsAgencies.ts. Most agencies publish one feed that
 * already bundles trip updates and vehicle positions together (LIRR, subway); Swiftly-hosted
 * agencies (NICE Bus, Suffolk County Transit) split those into two feeds instead, fetched in
 * parallel and merged here — downstream code still just sees one flat entity list either way.
 * Some agencies' realtime vehicle entities carry route_id directly on the trip descriptor (NYC
 * Subway); others don't and it's resolved via trips.txt instead (LIRR) — both are tried here
 * rather than assuming either.
 */
export async function getRouteStatus(agencyId: AgencyId, routeId: string): Promise<GtfsRouteStatus> {
  const { routesById, stopsById, tripsById } = loadAgencyStaticData(agencyId);
  const route = routesById.get(routeId);
  if (!route) throw new Error(`Unknown ${agencyId} route_id "${routeId}"`);

  const feedRequests = agencyConfig(agencyId).feedRequestsForRoute(routeId);
  const entityLists = await Promise.all(feedRequests.map((request) => fetchFeedEntities(request.url, request.headers)));
  const entities = entityLists.flat();
  const trips: GtfsTripStatus[] = [];
  const vehicles: GtfsVehicleStatus[] = [];

  for (const entity of entities) {
    const tripUpdate = entity.tripUpdate;
    if (tripUpdate && tripUpdate.trip.routeId === routeId) {
      const tripId = tripUpdate.trip.tripId ?? '';
      const tripMeta = tripsById.get(tripId);

      const stops: GtfsStopStatus[] = (tripUpdate.stopTimeUpdate ?? []).map((update) => {
        const stopId = update.stopId ?? '';
        const stop = stopsById.get(stopId);
        const event = update.arrival ?? update.departure;
        const time = event?.time != null ? Number(event.time) : null;
        return {
          stopId,
          stopName: stop?.name ?? stopId,
          lat: stop?.lat ?? 0,
          lon: stop?.lon ?? 0,
          sequence: update.stopSequence ?? 0,
          scheduledTime: time != null ? new Date(time * 1000).toISOString() : null,
          delaySeconds: event?.delay ?? null,
        };
      });

      trips.push({
        tripId,
        directionId: tripUpdate.trip.directionId ?? tripMeta?.directionId ?? 0,
        peakOffpeak: tripMeta?.peakOffpeak ?? null,
        stops,
      });
      continue;
    }

    const vehicle = entity.vehicle;
    const vehicleTripId = vehicle?.trip?.tripId;
    if (!vehicle?.position || !vehicleTripId) continue;
    const vehicleTripMeta = tripsById.get(vehicleTripId);
    const vehicleRouteId = vehicle.trip?.routeId ?? vehicleTripMeta?.routeId;
    if (vehicleRouteId !== routeId) continue;

    vehicles.push({
      tripId: vehicleTripId,
      directionId: vehicle.trip?.directionId ?? vehicleTripMeta?.directionId ?? 0,
      lat: vehicle.position.latitude,
      lon: vehicle.position.longitude,
      currentStatus: vehicle.currentStatus ?? null,
      stopId: vehicle.stopId ?? null,
    });
  }

  return { routeId, routeName: route.name, trips, vehicles };
}
