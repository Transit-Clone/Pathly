import { fetchLirrFeedEntities } from './lirrRealtime';
import { loadLirrStaticData } from './lirrStaticData';

export type LirrStopStatus = {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  sequence: number;
  scheduledTime: string | null;
  delaySeconds: number | null;
};

export type LirrTripStatus = {
  tripId: string;
  headsign: string;
  directionId: number;
  stops: LirrStopStatus[];
};

export type LirrVehicleStatus = {
  tripId: string;
  directionId: number;
  lat: number;
  lon: number;
  currentStatus: string | null;
  stopId: string | null;
  /** When this position was measured (epoch seconds), or null if the feed omitted it. */
  timestamp: number | null;
};

export type LirrBranchStatus = {
  routeId: string;
  routeName: string;
  trips: LirrTripStatus[];
  vehicles: LirrVehicleStatus[];
};

/**
 * Live trip updates and vehicle positions for one LIRR branch (e.g. route_id "10" = Port
 * Jefferson), with the raw GTFS-RT feed's numeric stop/route codes resolved to real names
 * and coordinates via the static GTFS reference data — the realtime feed alone only gives
 * IDs, delay deltas, and (for vehicles) lat/lon.
 */
export async function getLirrBranchStatus(routeId: string): Promise<LirrBranchStatus> {
  const { routesById, stopsById, tripsById } = loadLirrStaticData();
  const route = routesById.get(routeId);
  if (!route) throw new Error(`Unknown LIRR route_id "${routeId}"`);

  const entities = await fetchLirrFeedEntities();
  const trips: LirrTripStatus[] = [];
  const vehicles: LirrVehicleStatus[] = [];

  for (const entity of entities) {
    const tripUpdate = entity.tripUpdate;
    if (tripUpdate && tripUpdate.trip.routeId === routeId) {
      const tripId = tripUpdate.trip.tripId ?? '';
      const tripMeta = tripsById.get(tripId);

      const stops: LirrStopStatus[] = (tripUpdate.stopTimeUpdate ?? []).map((update) => {
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
        headsign: tripMeta?.headsign ?? 'Unknown',
        directionId: tripUpdate.trip.directionId ?? tripMeta?.directionId ?? 0,
        stops,
      });
      continue;
    }

    // Vehicle positions don't carry routeId directly (unlike trip updates) — resolve via trips.txt.
    const vehicle = entity.vehicle;
    const vehicleTripId = vehicle?.trip?.tripId;
    if (!vehicle?.position || !vehicleTripId) continue;
    const vehicleTripMeta = tripsById.get(vehicleTripId);
    if (vehicleTripMeta?.routeId !== routeId) continue;

    vehicles.push({
      tripId: vehicleTripId,
      // The feed omits direction on vehicle positions and protobufjs then reports a default 0,
      // so `??` never falls through; trips.txt is authoritative for which way a trip runs.
      directionId: vehicleTripMeta.directionId,
      lat: vehicle.position.latitude,
      lon: vehicle.position.longitude,
      currentStatus: vehicle.currentStatus ?? null,
      stopId: vehicle.stopId ?? null,
      // protobuf uint64 decodes to a Long object; String() + Number() unwraps it safely.
      timestamp: vehicle.timestamp != null ? Number(String(vehicle.timestamp)) : null,
    });
  }

  return { routeId, routeName: route.name, trips, vehicles };
}
