import { haversineMeters } from './geo';
import { AGENCY_CONFIGS, agencyConfig, type AgencyId } from './gtfsAgencies';
import { gtfsTimeToSeconds, loadAgencyStaticData, loadGlobalStopRouteIndex, loadRouteStopTimes } from './gtfsStaticData';

export type NearbyStop = {
  /** The parent station's stop_id for agencies with directional platform stop_ids (one entry per physical station, not per direction); otherwise the stop's own id. */
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  routeIds: string[];
};

/** Nearest stops on one agency's system to a point. */
export async function findNearestStops(agencyId: AgencyId, lat: number, lon: number, limit = 8): Promise<NearbyStop[]> {
  const config = agencyConfig(agencyId);
  const { stopsById } = loadAgencyStaticData(agencyId);
  const stopRouteIndex = await loadGlobalStopRouteIndex(agencyId);

  const routeIdsByStation = new Map<string, Set<string>>();
  for (const stop of stopsById.values()) {
    const routeIds = stopRouteIndex.get(stop.stopId);
    if (!routeIds) continue;
    const stationId = config.directionalStops ? (stop.parentStation ?? stop.stopId) : stop.stopId;
    const set = routeIdsByStation.get(stationId);
    if (set) for (const routeId of routeIds) set.add(routeId);
    else routeIdsByStation.set(stationId, new Set(routeIds));
  }

  const results: NearbyStop[] = [];
  for (const [stationId, routeIds] of routeIdsByStation) {
    const station = stopsById.get(stationId);
    if (!station) continue;
    results.push({
      stopId: stationId,
      stopName: station.name,
      lat: station.lat,
      lon: station.lon,
      distanceMeters: haversineMeters(lat, lon, station.lat, station.lon),
      routeIds: [...routeIds],
    });
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results.slice(0, limit);
}

export type RouteGeometryStop = { stopId: string; name: string; lat: number; lon: number; offsetMinutes: number };
export type RouteGeometry = { headsign: string; stops: RouteGeometryStop[] };

/** Chain-building only — `timeSeconds` is each stop's real scheduled time, converted to the public `offsetMinutes` (relative to the chain's own first stop) once the full chain is assembled. */
type ChainStop = { stopId: string; name: string; lat: number; lon: number; timeSeconds: number };
type TripShape = { tripId: string; headsign: string; stops: ChainStop[] };

/**
 * A representative real station sequence — with each stop's real scheduled time offset from
 * the first stop — for one route_id/direction_id. Works for any route on any configured
 * agency, including branches whose trips split partway (LIRR's Port Jefferson Branch splits at
 * Huntington: electric trains run Penn Station<->Huntington, diesel trains run
 * Huntington<->Port Jefferson, so no single trip covers the whole branch). Starts from the
 * longest scheduled trip, then repeatedly chains on any other trip whose first stop matches
 * the current chain's last stop, splicing them together at the shared station — this is
 * exactly how a human would reconstruct the full branch from its real timetable, just
 * automated, so it needs no hand-authored geometry (or timing) for any specific route. This is
 * the one real source of a route's full stop sequence and timing — the client uses it for both
 * the map and the "Route stops" list, rather than keeping a second, hand-authored stop list
 * that can silently drift from (or simply never match) this real one.
 */
export async function getRouteGeometry(agencyId: AgencyId, routeId: string, directionId: 0 | 1): Promise<RouteGeometry | null> {
  const config = agencyConfig(agencyId);
  const { tripsById, stopsById } = loadAgencyStaticData(agencyId);
  const { byTrip } = await loadRouteStopTimes(agencyId, routeId);

  const resolveStop = (stopId: string): { stopId: string; name: string; lat: number; lon: number } | null => {
    const stop = stopsById.get(stopId);
    if (!stop) return null;
    const resolved = config.directionalStops && stop.parentStation ? stopsById.get(stop.parentStation) : stop;
    return resolved ? { stopId: resolved.stopId, name: resolved.name, lat: resolved.lat, lon: resolved.lon } : null;
  };

  const candidateTrips: TripShape[] = [];
  for (const [tripId, stopTimes] of byTrip) {
    const trip = tripsById.get(tripId);
    if (!trip || trip.directionId !== directionId) continue;
    const stops = [...stopTimes]
      .sort((a, b) => a.stopSequence - b.stopSequence)
      .map((stopTime): ChainStop | null => {
        const resolved = resolveStop(stopTime.stopId);
        if (!resolved) return null;
        return { ...resolved, timeSeconds: gtfsTimeToSeconds(stopTime.arrivalTime || stopTime.departureTime) };
      })
      .filter((stop): stop is ChainStop => stop !== null);
    if (stops.length > 0) candidateTrips.push({ tripId, headsign: trip.headsign, stops });
  }
  if (candidateTrips.length === 0) return null;

  candidateTrips.sort((a, b) => b.stops.length - a.stops.length);
  const base = candidateTrips[0]!;
  const usedTripIds = new Set([base.tripId]);
  let headsign = base.headsign;
  let stops = base.stops;

  // Chains in both directions: appending a trip whose first stop matches the chain's current
  // last stop (and adopting its headsign, since that becomes the new true final destination —
  // e.g. a Penn<->Huntington trip's "Huntington" headsign is replaced by a chained-on
  // Huntington<->Port Jefferson trip's "Port Jefferson"), or prepending a trip whose last stop
  // matches the chain's current first stop (headsign unchanged — the destination doesn't
  // change just because an earlier leg was found).
  //
  // A chained-on trip is a *different, unrelated* trip_id that just happens to share a stop_id
  // with the current chain (e.g. LIRR's electric Penn<->Huntington and diesel
  // Huntington<->Port Jefferson trips) — it is not necessarily the same physical train
  // continuing, and its own schedule can be anchored at a completely different time of day, so
  // its absolute stop times can't be trusted as-is (splicing them in directly produced
  // nonsensical negative offsets for stops past Huntington). Each spliced-on segment is
  // rebased by a constant so its shared stop lines up exactly with the chain's existing time
  // there — this preserves every real per-hop duration *within* that segment (only a flat
  // shift is applied) while guaranteeing the assembled chain's offsets increase smoothly
  // through the splice, the same way the station list was hand-chained end to end before this
  // was automated, just derived from real data instead of estimated.
  let extended = true;
  while (extended) {
    extended = false;
    const lastStopId = stops[stops.length - 1]?.stopId;
    const firstStopId = stops[0]?.stopId;
    for (const candidate of candidateTrips) {
      if (usedTripIds.has(candidate.tripId)) continue;
      if (candidate.stops[0]?.stopId === lastStopId) {
        const correction = stops[stops.length - 1]!.timeSeconds - candidate.stops[0]!.timeSeconds;
        const rebased = candidate.stops.map((stop) => ({ ...stop, timeSeconds: stop.timeSeconds + correction }));
        stops = [...stops, ...rebased.slice(1)];
        usedTripIds.add(candidate.tripId);
        headsign = candidate.headsign;
        extended = true;
        break;
      }
      if (candidate.stops[candidate.stops.length - 1]?.stopId === firstStopId) {
        const correction = stops[0]!.timeSeconds - candidate.stops[candidate.stops.length - 1]!.timeSeconds;
        const rebased = candidate.stops.map((stop) => ({ ...stop, timeSeconds: stop.timeSeconds + correction }));
        stops = [...rebased.slice(0, -1), ...stops];
        usedTripIds.add(candidate.tripId);
        extended = true;
        break;
      }
    }
  }

  const firstTimeSeconds = stops[0]?.timeSeconds ?? 0;
  return {
    headsign,
    stops: stops.map(({ timeSeconds, ...stop }) => ({ ...stop, offsetMinutes: Math.round((timeSeconds - firstTimeSeconds) / 60) })),
  };
}

export type DirectionInfo = {
  direction1: { headsign: string | null; stopId: string | null };
  direction0: { headsign: string | null; stopId: string | null };
};

/**
 * Which of a station's stop_id(s) to use for live predictions in each direction, plus each
 * direction's real headsign. For non-directional-stop agencies (LIRR) both directions share
 * the station's own stop_id. For directional-stop agencies (NYC Subway), the platform-level
 * stop_id for each direction is found by scanning the route's real scheduled stops — not
 * assumed from an id suffix, which is a per-line GTFS convention, not a geographic one, so it
 * isn't safe to assume it's consistent across every line.
 */
export async function getDirectionInfo(agencyId: AgencyId, routeId: string, stationStopId: string): Promise<DirectionInfo> {
  const config = agencyConfig(agencyId);
  const { tripsById } = loadAgencyStaticData(agencyId);

  if (!config.directionalStops) {
    let direction1Headsign: string | null = null;
    let direction0Headsign: string | null = null;
    for (const trip of tripsById.values()) {
      if (direction1Headsign && direction0Headsign) break;
      if (trip.routeId !== routeId) continue;
      if (trip.directionId === 1 && !direction1Headsign) direction1Headsign = trip.headsign;
      if (trip.directionId === 0 && !direction0Headsign) direction0Headsign = trip.headsign;
    }
    return {
      direction1: { headsign: direction1Headsign, stopId: stationStopId },
      direction0: { headsign: direction0Headsign, stopId: stationStopId },
    };
  }

  const { stopsById } = loadAgencyStaticData(agencyId);
  const { byTrip } = await loadRouteStopTimes(agencyId, routeId);

  let direction1Headsign: string | null = null;
  let direction0Headsign: string | null = null;
  let direction1StopId: string | null = null;
  let direction0StopId: string | null = null;

  for (const [tripId, stopTimes] of byTrip) {
    if (direction1StopId && direction0StopId) break;
    const trip = tripsById.get(tripId);
    if (!trip) continue;
    const match = stopTimes.find((stopTime) => stopsById.get(stopTime.stopId)?.parentStation === stationStopId);
    if (!match) continue;
    if (trip.directionId === 1 && !direction1StopId) {
      direction1StopId = match.stopId;
      direction1Headsign = trip.headsign;
    }
    if (trip.directionId === 0 && !direction0StopId) {
      direction0StopId = match.stopId;
      direction0Headsign = trip.headsign;
    }
  }

  return {
    direction1: { headsign: direction1Headsign, stopId: direction1StopId },
    direction0: { headsign: direction0Headsign, stopId: direction0StopId },
  };
}

export type NearestRouteStop = {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  direction1: { headsign: string | null; stopId: string | null };
  direction0: { headsign: string | null; stopId: string | null };
};

/**
 * The nearest stop *on one specific route* to a point — e.g. "which Port Jefferson Branch
 * station is actually closest to the rider right now", not just the nearest station anywhere
 * on the LIRR system. This is what lets a route card follow the rider as they move, instead of
 * always anchoring to one hand-picked station (see transit.ts's old hardcoded `stopName`/
 * `direction1StopId`/`direction0StopId` — the thing this replaces). Groups directional platform
 * stop_ids under their parent station first (same as findNearestStops), so a subway route with
 * separate uptown/downtown stop_ids still reports one entry per physical station.
 *
 * Only counts a station if this route calls there with real regularity (at least 10% as many
 * scheduled trips as this route's busiest stop) — not just anywhere a rare rerouted/overnight
 * trip happens to touch. Without this, the nearest-but-barely-served station can get picked
 * (e.g. the E train's static schedule includes a handful of trips diverted to Jamaica-179 St,
 * which otherwise looks like a perfectly normal stop), leaving live predictions permanently
 * empty there since real trains almost never actually call.
 */
export async function getNearestStopForRoute(agencyId: AgencyId, routeId: string, lat: number, lon: number): Promise<NearestRouteStop | null> {
  const config = agencyConfig(agencyId);
  const { stopsById } = loadAgencyStaticData(agencyId);
  const { byStop } = await loadRouteStopTimes(agencyId, routeId);

  const tripCountByStopId = new Map<string, number>();
  for (const [stopId, stopTimes] of byStop) tripCountByStopId.set(stopId, stopTimes.length);
  const maxTripCount = Math.max(0, ...tripCountByStopId.values());
  const MIN_SERVICE_FRACTION = 0.1;

  const stationIds = new Set<string>();
  for (const stop of stopsById.values()) {
    const tripCount = tripCountByStopId.get(stop.stopId) ?? 0;
    if (tripCount === 0 || tripCount < maxTripCount * MIN_SERVICE_FRACTION) continue;
    stationIds.add(config.directionalStops ? (stop.parentStation ?? stop.stopId) : stop.stopId);
  }

  let nearest: { stopId: string; name: string; lat: number; lon: number; distanceMeters: number } | null = null;
  for (const stationId of stationIds) {
    const station = stopsById.get(stationId);
    if (!station) continue;
    const distanceMeters = haversineMeters(lat, lon, station.lat, station.lon);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { stopId: stationId, name: station.name, lat: station.lat, lon: station.lon, distanceMeters };
    }
  }
  if (!nearest) return null;

  const direction = await getDirectionInfo(agencyId, routeId, nearest.stopId);
  return { ...nearest, direction1: direction.direction1, direction0: direction.direction0 };
}

export type DiscoveredRoute = {
  agencyId: AgencyId;
  agencyDisplayName: string;
  routeId: string;
  routeName: string;
  /** Hex, with a leading "#" (GTFS stores it bare). */
  color: string;
  nearestStop: { stopId: string; name: string; lat: number; lon: number; distanceMeters: number };
  direction1: { headsign: string | null; stopId: string | null };
  direction0: { headsign: string | null; stopId: string | null };
};

// "Nearest" isn't the same as "nearby" — findNearestStops always returns the N closest stops
// in that agency's whole system, even if that's 50 miles away somewhere with no real transit
// nearby. These cut off anything past a distance no one would reasonably call "nearby", and
// differ by agency since riders realistically travel farther to a sparse LIRR station than to
// a dense subway stop; a new agency without an entry here gets the subway-style default.
const MAX_NEARBY_DISTANCE_METERS: Partial<Record<AgencyId, number>> = {
  subway: 1_600, // ~1 mile — subway stations are dense; anything farther isn't walkably "nearby".
  lirr: 8_000, // ~5 miles — LIRR branches are sparse; riders commonly drive to a station.
};
const DEFAULT_MAX_NEARBY_DISTANCE_METERS = 1_600;

/**
 * Every real route, on every configured agency, near a point — not limited to the handful of
 * routes this app has hand-built UI for. One entry per (agency, route_id); a station served by
 * several routes (e.g. a subway hub, or a LIRR station shared by branches) produces one entry
 * per route, all anchored at that same station. Returns an empty list if nothing real is
 * actually nearby, rather than the closest thing regardless of distance. Adding a new agency
 * to gtfsAgencies.ts makes it show up here automatically — nothing in this function is
 * agency-specific.
 */
export async function findNearbyTransit(lat: number, lon: number, limit = 6): Promise<DiscoveredRoute[]> {
  const agencyIds = Object.keys(AGENCY_CONFIGS) as AgencyId[];

  const perAgencyResults = await Promise.all(
    agencyIds.map(async (agencyId): Promise<DiscoveredRoute[]> => {
      const config = agencyConfig(agencyId);
      const maxDistance = MAX_NEARBY_DISTANCE_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_DISTANCE_METERS;
      const nearestStops = (await findNearestStops(agencyId, lat, lon)).filter((stop) => stop.distanceMeters <= maxDistance);
      const { routesById } = loadAgencyStaticData(agencyId);

      // Each (routeId, stop) pair can trigger its own file stream the first time that routeId
      // is seen — resolving them concurrently rather than one at a time is the difference
      // between this taking as long as the single slowest route instead of the sum of all of
      // them, which matters a lot at a hub station served by several lines.
      const work: { stop: (typeof nearestStops)[number]; routeId: string }[] = [];
      const seenRouteIds = new Set<string>();
      for (const stop of nearestStops) {
        for (const routeId of stop.routeIds) {
          if (seenRouteIds.has(routeId)) continue;
          seenRouteIds.add(routeId);
          work.push({ stop, routeId });
        }
      }

      const routes = await Promise.all(
        work.map(async ({ stop, routeId }): Promise<DiscoveredRoute | null> => {
          const route = routesById.get(routeId);
          if (!route) return null;
          const direction = await getDirectionInfo(agencyId, routeId, stop.stopId);
          return {
            agencyId,
            agencyDisplayName: config.displayName,
            routeId,
            routeName: route.name,
            color: `#${route.color}`,
            nearestStop: { stopId: stop.stopId, name: stop.stopName, lat: stop.lat, lon: stop.lon, distanceMeters: stop.distanceMeters },
            direction1: direction.direction1,
            direction0: direction.direction0,
          };
        }),
      );
      return routes.filter((route): route is DiscoveredRoute => route !== null);
    }),
  );

  return perAgencyResults
    .flat()
    .sort((a, b) => a.nearestStop.distanceMeters - b.nearestStop.distanceMeters)
    .slice(0, limit);
}
