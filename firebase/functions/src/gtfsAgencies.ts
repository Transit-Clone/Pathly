/**
 * One entry per transit agency this backend knows how to talk to. Adding a new GTFS + GTFS-RT
 * agency (Metro-North) is meant to be: drop its static data into static_data/<dataDir>, add a
 * config entry here, done — no new files. The rest of the backend
 * (gtfsStaticData/gtfsRealtime/gtfsStatus/gtfsSchedule/gtfsDiscovery) reads every agency
 * through this same config, not agency-specific code paths.
 *
 * MTA Bus Time is the one exception this can't cover as-is: it's a SIRI API, not GTFS-RT, so
 * it needs its own fetch/decode adapter. It would still plug into the rest of this engine (the
 * static GTFS side, schedule logic, discovery) by producing the same FeedEntity-shaped output
 * gtfsRealtime.ts already works with — not a reason to fork the whole pipeline again.
 */

export type AgencyId = 'lirr' | 'subway' | 'nice' | 'suffolk';

/** One GTFS-RT feed to fetch and merge in — most agencies need just one (an agency-wide feed that already bundles trip updates and vehicle positions); Swiftly-hosted agencies publish those as two separate feeds instead. */
export type FeedRequest = { url: string; headers?: Record<string, string> };

export type AgencyConfig = {
  id: AgencyId;
  displayName: string;
  /** Subdirectory under firebase/functions/static_data/. */
  dataDir: string;
  /**
   * True when stops.txt groups directional platform-level stop_ids under a parent_station
   * (NYC Subway: "G06N"/"G06S" under parent "G06") — direction must then be read from *which*
   * stop_id a trip actually hits, since direction_id is unreliable there. False when one
   * stop_id serves a station regardless of direction (LIRR, NICE Bus, Suffolk County Transit)
   * and direction_id can be trusted.
   */
  directionalStops: boolean;
  /**
   * Whether the static timetable can safely pad live predictions when live has nothing
   * upcoming (see gtfsSchedule.ts). Needs the realtime feed's trip_ids to match the static
   * schedule's trip_ids for dedup — confirmed matching for LIRR and Suffolk County Transit
   * (e.g. live "265-2429" is trips.txt's "265-2429" exactly); confirmed *not* matching for NYC
   * Subway (live "086750_E..N66R" vs static "BSP26GEN-E049-Sunday-00_001400_E..S04R") or NICE
   * Bus (live trip_ids like "2044028" don't appear in trips.txt at all — a different id scheme).
   */
  supportsStaticFallback: boolean;
  /** Some agencies split their GTFS-RT feed by line group (subway) or by feed type (Swiftly-hosted agencies' trip-updates/vehicle-positions); most publish one combined feed for the whole system (LIRR). */
  feedRequestsForRoute(routeId: string): FeedRequest[];
};

const LIRR_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';

const SUBWAY_FEED_BASE_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/';
/** Each route_id this app knows about mapped to its feed. Add an entry when a route for one of the other five feeds (bdfm, g, jz, nqrw, si) is wired up. */
const SUBWAY_FEED_PATH_BY_ROUTE_ID: Record<string, string> = {
  A: 'nyct%2Fgtfs-ace', C: 'nyct%2Fgtfs-ace', E: 'nyct%2Fgtfs-ace',
  L: 'nyct%2Fgtfs-l',
  '1': 'nyct%2Fgtfs', '2': 'nyct%2Fgtfs', '3': 'nyct%2Fgtfs', '4': 'nyct%2Fgtfs', '5': 'nyct%2Fgtfs', '6': 'nyct%2Fgtfs', '7': 'nyct%2Fgtfs', S: 'nyct%2Fgtfs',
};

/**
 * NICE Bus and Suffolk County Transit's real-time feeds are hosted by Swiftly (a third-party
 * real-time data provider many smaller agencies use), not published directly by the agency —
 * one combined GTFS-RT feed per agency like LIRR/subway, just split across two endpoints
 * (trip updates, vehicle positions) under one shared URL/auth pattern. Set via
 * `firebase functions:secrets:set SWIFTLY_API_KEY`; injected into `process.env` at runtime by
 * the `secrets` option on whichever onCall function actually fetches live data
 * (getRouteLiveStatus) — see index.ts.
 */
function swiftlyFeedRequests(agencyKey: string): FeedRequest[] {
  const headers = { Authorization: process.env.SWIFTLY_API_KEY ?? '' };
  return [
    { url: `https://api.goswift.ly/real-time/${agencyKey}/gtfs-rt-trip-updates`, headers },
    { url: `https://api.goswift.ly/real-time/${agencyKey}/gtfs-rt-vehicle-positions`, headers },
  ];
}

export const AGENCY_CONFIGS: Record<AgencyId, AgencyConfig> = {
  lirr: {
    id: 'lirr',
    displayName: 'LIRR',
    dataDir: 'lirr',
    directionalStops: false,
    supportsStaticFallback: true,
    feedRequestsForRoute: () => [{ url: LIRR_FEED_URL }],
  },
  subway: {
    id: 'subway',
    displayName: 'MTA Subway',
    dataDir: 'subway',
    directionalStops: true,
    supportsStaticFallback: false,
    feedRequestsForRoute: (routeId) => {
      const path = SUBWAY_FEED_PATH_BY_ROUTE_ID[routeId];
      if (!path) throw new Error(`No known GTFS-RT feed for subway route_id "${routeId}"`);
      return [{ url: `${SUBWAY_FEED_BASE_URL}${path}` }];
    },
  },
  nice: {
    id: 'nice',
    displayName: 'NICE Bus',
    // Every stop on this system serves only one direction (confirmed: 0 of 2484 stops have a
    // parent_station, and every stop's trips are all one direction_id) — true, not false, so
    // getStopPredictions checks each of direction1StopId/direction0StopId independently rather
    // than assuming one shared id. Unlike subway, there's no parent_station linking a stop to
    // its opposite-direction twin, so getDirectionInfo/getNearestStopForRoute can't resolve
    // "the other direction's stop_id" from just one — a route's dynamic nearest-stop lookup
    // degrades gracefully to its static fallback stop (see transit.ts) rather than following
    // the rider's GPS location, which still needs addressing if that matters for this agency.
    directionalStops: true,
    dataDir: 'nice',
    supportsStaticFallback: false,
    feedRequestsForRoute: () => swiftlyFeedRequests('nice-bus'),
  },
  suffolk: {
    id: 'suffolk',
    displayName: 'Suffolk County Transit',
    // Same direction-paired-stops, no-parent_station situation as NICE Bus above.
    directionalStops: true,
    dataDir: 'suffolk',
    supportsStaticFallback: true,
    feedRequestsForRoute: () => swiftlyFeedRequests('suffolk-county'),
  },
};

export function agencyConfig(agencyId: AgencyId): AgencyConfig {
  const config = AGENCY_CONFIGS[agencyId];
  if (!config) throw new Error(`Unknown agency "${agencyId}"`);
  return config;
}
