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

export type NearestRouteStop = {
  /** Smallest of direction1/direction0's distanceMeters — "how far is the nearest thing on this route", for display. */
  distanceMeters: number;
  direction1: { stopId: string; name: string; headsign: string | null } | null;
  direction0: { stopId: string; name: string; headsign: string | null } | null;
};

/**
 * The nearest stop *on one specific route* to a point, resolved independently for each
 * direction — e.g. "which Port Jefferson Branch station is actually closest to the rider right
 * now", not just the nearest station anywhere on the LIRR system, and not assuming the two
 * directions share a station at all.
 *
 * Earlier versions of this found one nearest "station" (grouping directional platform
 * stop_ids under their parent_station, same as findNearestStops) and then asked which stop_id
 * served each direction *at that station*. That only works for agencies with a parent_station
 * link (NYC Subway) or where one stop_id truly serves both directions (LIRR) — NICE Bus and
 * Suffolk County Transit have neither: every stop serves exactly one direction, with no
 * parent_station tying it to its opposite-direction counterpart (confirmed: 0 of several
 * thousand stops across both agencies have one set), so that approach always came back empty
 * for them. Searching independently per direction needs no such link for any agency — it's
 * just "the nearest stop among the ones this route's direction_id-1 trips actually visit," and
 * the same again for direction_id 0 — so one path now covers every agency uniformly.
 *
 * Only counts a stop if this route calls there with real regularity (at least 10% as many
 * scheduled trips, within its own direction, as that direction's busiest stop) — not just
 * anywhere a rare rerouted/overnight trip happens to touch. Without this, a nearest-but-barely
 * -served stop can get picked (e.g. the E train's static schedule includes a handful of trips
 * diverted to Jamaica-179 St, which otherwise looks like a perfectly normal stop), leaving live
 * predictions permanently empty there since real trips almost never actually call.
 */
export async function getNearestStopForRoute(agencyId: AgencyId, routeId: string, lat: number, lon: number): Promise<NearestRouteStop | null> {
  const { stopsById, tripsById } = loadAgencyStaticData(agencyId);
  const { byStop } = await loadRouteStopTimes(agencyId, routeId);

  const tripCountByDirectionAndStop: Record<0 | 1, Map<string, number>> = { 0: new Map(), 1: new Map() };
  for (const [stopId, stopTimes] of byStop) {
    for (const stopTime of stopTimes) {
      const directionId = tripsById.get(stopTime.tripId)?.directionId;
      if (directionId !== 0 && directionId !== 1) continue;
      const counts = tripCountByDirectionAndStop[directionId];
      counts.set(stopId, (counts.get(stopId) ?? 0) + 1);
    }
  }

  const MIN_SERVICE_FRACTION = 0.1;
  const nearestInDirection = (directionId: 0 | 1): { stopId: string; name: string; headsign: string | null; distanceMeters: number } | null => {
    const tripCounts = tripCountByDirectionAndStop[directionId];
    const maxTripCount = Math.max(0, ...tripCounts.values());
    let nearest: { stopId: string; name: string; distanceMeters: number } | null = null;
    for (const [stopId, tripCount] of tripCounts) {
      if (tripCount < maxTripCount * MIN_SERVICE_FRACTION) continue;
      const stop = stopsById.get(stopId);
      if (!stop) continue;
      const distanceMeters = haversineMeters(lat, lon, stop.lat, stop.lon);
      if (!nearest || distanceMeters < nearest.distanceMeters) {
        nearest = { stopId, name: stop.name, distanceMeters };
      }
    }
    if (!nearest) return null;
    let headsign: string | null = null;
    for (const trip of tripsById.values()) {
      if (trip.routeId === routeId && trip.directionId === directionId) {
        headsign = trip.headsign;
        break;
      }
    }
    return { ...nearest, headsign };
  };

  const direction1 = nearestInDirection(1);
  const direction0 = nearestInDirection(0);
  if (!direction1 && !direction0) return null;

  return {
    distanceMeters: Math.min(direction1?.distanceMeters ?? Infinity, direction0?.distanceMeters ?? Infinity),
    direction1,
    direction0,
  };
}

export type DiscoveredRoute = {
  agencyId: AgencyId;
  agencyDisplayName: string;
  routeId: string;
  routeName: string;
  shortName: string;
  /** Hex, with a leading "#" (GTFS stores it bare). */
  color: string;
  /** Smallest of direction1/direction0's own distance — see getNearestStopForRoute. */
  distanceMeters: number;
  direction1: { stopId: string; name: string; headsign: string | null } | null;
  direction0: { stopId: string; name: string; headsign: string | null } | null;
};

// "Nearest" isn't the same as "nearby" — findNearestStops always returns the N closest stops
// in that agency's whole system, even if that's 50 miles away somewhere with no real transit
// nearby. These cut off anything past a distance no one would reasonably call "nearby", and
// differ by agency since riders realistically travel farther to a sparse LIRR station than to
// a dense subway stop; a new agency without an entry here gets the subway-style default.
const MAX_NEARBY_DISTANCE_METERS: Partial<Record<AgencyId, number>> = {
  subway: 1_600, // ~1 mile — subway stations are dense; anything farther isn't walkably "nearby".
  lirr: 8_000, // ~5 miles — LIRR branches are sparse; riders commonly drive to a station.
  nice: 2_400, // ~1.5 miles — suburban bus stops are sparser than subway but denser than LIRR.
  suffolk: 2_400,
};
const DEFAULT_MAX_NEARBY_DISTANCE_METERS = 1_600;

// findNearestStops' own default (8) exists for callers that just want "the N closest
// regardless of count" (findNearestStops' own docs); here it's only a candidate-discovery
// step before the real maxDistance filter below, so it needs to be generous enough that the
// distance filter — not this count — decides what's "nearby". Without this, a dense bus hub
// easily serving 10+ distinct routes nearby would have most of them silently dropped before
// their distance was even checked.
const CANDIDATE_STOPS_PER_AGENCY = 200;

/**
 * Every real route, on every configured agency, near a point — not limited to the handful of
 * routes this app has hand-built UI for, and not capped to a small count either (every route
 * within MAX_NEARBY_DISTANCE_METERS is returned). One entry per (agency, route_id); a station
 * served by several routes (e.g. a subway hub, or a LIRR station shared by branches) produces
 * one entry per route, all anchored at that same station. Returns an empty list if nothing
 * real is actually nearby, rather than the closest thing regardless of distance. Adding a new
 * agency to gtfsAgencies.ts makes it show up here automatically — nothing in this function is
 * agency-specific.
 */
export async function findNearbyTransit(lat: number, lon: number, limit = 100): Promise<DiscoveredRoute[]> {
  const agencyIds = Object.keys(AGENCY_CONFIGS) as AgencyId[];

  const perAgencyResults = await Promise.all(
    agencyIds.map(async (agencyId): Promise<DiscoveredRoute[]> => {
      const config = agencyConfig(agencyId);
      const maxDistance = MAX_NEARBY_DISTANCE_METERS[agencyId] ?? DEFAULT_MAX_NEARBY_DISTANCE_METERS;
      // findNearestStops is only used here to cheaply discover *which route_ids* are plausibly
      // nearby at all (grouping by parent_station is fine for that); each candidate's actual
      // stop/distance is then resolved precisely via getNearestStopForRoute, independently per
      // direction — the parent_station grouping isn't safe to trust for that part (NICE
      // Bus/Suffolk County Transit don't have one — see that function's own comment).
      const nearestStops = (await findNearestStops(agencyId, lat, lon, CANDIDATE_STOPS_PER_AGENCY)).filter((stop) => stop.distanceMeters <= maxDistance);
      const { routesById } = loadAgencyStaticData(agencyId);

      // Resolving candidate routeIds concurrently rather than one at a time is the difference
      // between this taking as long as the single slowest route instead of the sum of all of
      // them, which matters a lot at a hub station served by several lines.
      const candidateRouteIds = new Set<string>();
      for (const stop of nearestStops) {
        for (const routeId of stop.routeIds) candidateRouteIds.add(routeId);
      }

      const routes = await Promise.all(
        [...candidateRouteIds].map(async (routeId): Promise<DiscoveredRoute | null> => {
          const route = routesById.get(routeId);
          if (!route) return null;
          const nearest = await getNearestStopForRoute(agencyId, routeId, lat, lon);
          if (!nearest || nearest.distanceMeters > maxDistance) return null;
          return {
            agencyId,
            agencyDisplayName: config.displayName,
            routeId,
            routeName: route.name,
            shortName: route.shortName,
            color: `#${route.color}`,
            distanceMeters: nearest.distanceMeters,
            direction1: nearest.direction1,
            direction0: nearest.direction0,
          };
        }),
      );
      return routes.filter((route): route is DiscoveredRoute => route !== null);
    }),
  );

  return perAgencyResults
    .flat()
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}
