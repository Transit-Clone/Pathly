/**
 * One entry per transit agency this backend knows how to talk to. Adding a new GTFS + GTFS-RT
 * agency (Metro-North, NICE Bus, Suffolk County Transit) is meant to be: drop its static data
 * into static_data/<dataDir>, add a config entry here, done — no new files. The rest of the
 * backend (gtfsStaticData/gtfsRealtime/gtfsStatus/gtfsSchedule/gtfsDiscovery) reads every
 * agency through this same config, not agency-specific code paths.
 *
 * MTA Bus Time is the one exception this can't cover as-is: it's a SIRI API, not GTFS-RT, so
 * it needs its own fetch/decode adapter. It would still plug into the rest of this engine (the
 * static GTFS side, schedule logic, discovery) by producing the same FeedEntity-shaped output
 * gtfsRealtime.ts already works with — not a reason to fork the whole pipeline again.
 */

export type AgencyId = 'lirr' | 'subway';

export type AgencyConfig = {
  id: AgencyId;
  displayName: string;
  /** Subdirectory under firebase/functions/static_data/. */
  dataDir: string;
  /**
   * True when stops.txt groups directional platform-level stop_ids under a parent_station
   * (NYC Subway: "G06N"/"G06S" under parent "G06") — direction must then be read from *which*
   * stop_id a trip actually hits, since direction_id is unreliable there. False when one
   * stop_id serves a station regardless of direction (LIRR) and direction_id can be trusted.
   */
  directionalStops: boolean;
  /**
   * Whether the static timetable can safely pad live predictions when live has nothing
   * upcoming (see gtfsSchedule.ts). Needs the realtime feed's trip_ids to match the static
   * schedule's trip_ids for dedup — true for LIRR (confirmed matching), false for NYC Subway
   * (confirmed *not* matching: realtime "086750_E..N66R" vs static
   * "BSP26GEN-E049-Sunday-00_001400_E..S04R").
   */
  supportsStaticFallback: boolean;
  /** Some agencies split their GTFS-RT feed by line group (subway); most publish one feed for the whole system (LIRR). */
  feedUrlForRoute(routeId: string): string;
};

const LIRR_FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';

const SUBWAY_FEED_BASE_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/';
/** Each route_id this app knows about mapped to its feed. Add an entry when a route for one of the other five feeds (bdfm, g, jz, nqrw, si) is wired up. */
const SUBWAY_FEED_PATH_BY_ROUTE_ID: Record<string, string> = {
  A: 'nyct%2Fgtfs-ace', C: 'nyct%2Fgtfs-ace', E: 'nyct%2Fgtfs-ace',
  L: 'nyct%2Fgtfs-l',
  '1': 'nyct%2Fgtfs', '2': 'nyct%2Fgtfs', '3': 'nyct%2Fgtfs', '4': 'nyct%2Fgtfs', '5': 'nyct%2Fgtfs', '6': 'nyct%2Fgtfs', '7': 'nyct%2Fgtfs', S: 'nyct%2Fgtfs',
};

export const AGENCY_CONFIGS: Record<AgencyId, AgencyConfig> = {
  lirr: {
    id: 'lirr',
    displayName: 'LIRR',
    dataDir: 'lirr',
    directionalStops: false,
    supportsStaticFallback: true,
    feedUrlForRoute: () => LIRR_FEED_URL,
  },
  subway: {
    id: 'subway',
    displayName: 'MTA Subway',
    dataDir: 'subway',
    directionalStops: true,
    supportsStaticFallback: false,
    feedUrlForRoute: (routeId) => {
      const path = SUBWAY_FEED_PATH_BY_ROUTE_ID[routeId];
      if (!path) throw new Error(`No known GTFS-RT feed for subway route_id "${routeId}"`);
      return `${SUBWAY_FEED_BASE_URL}${path}`;
    },
  },
};

export function agencyConfig(agencyId: AgencyId): AgencyConfig {
  const config = AGENCY_CONFIGS[agencyId];
  if (!config) throw new Error(`Unknown agency "${agencyId}"`);
  return config;
}
