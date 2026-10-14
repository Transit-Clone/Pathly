/**
 * One entry per transit agency this backend knows how to talk to. Adding a new GTFS + GTFS-RT
 * agency (Metro-North) is meant to be: drop its static data into static_data/<dataDir>, add a
 * config entry here, done — no new files. The rest of the backend
 * (gtfsStaticData/gtfsRealtime/gtfsStatus/gtfsSchedule/gtfsDiscovery) reads every agency
 * through this same config, not agency-specific code paths.
 *
 * MTA Bus Time also publishes GTFS-RT (alongside its SIRI API), so the city buses fit the same
 * model: one entry per published borough feed, all sharing Bus Time's system-wide live feed.
 */

import type { GtfsSnapshotLimits } from './gtfsSnapshots';

export type AgencyId = 'lirr' | 'subway' | 'nice' | 'suffolk' | BusAgencyId | 'nycferry';
/** NYC Transit's five borough bus feeds and MTA Bus Company: one agency per published feed. */
export type BusAgencyId = 'bx' | 'bk' | 'mn' | 'qn' | 'si' | 'busco';
export const MTA_BUS_AGENCY_IDS: readonly BusAgencyId[] = ['bx', 'bk', 'mn', 'qn', 'si', 'busco'];

/** One GTFS-RT feed to fetch and merge in — most agencies need just one (an agency-wide feed that already bundles trip updates and vehicle positions); Swiftly-hosted agencies publish those as two separate feeds instead. */
export type FeedRequest = { url: string; headers?: Record<string, string> };

export type AgencyConfig = {
  id: AgencyId;
  displayName: string;
  /** Subdirectory under firebase/functions/static_data/. */
  dataDir: string;
  /** Official static GTFS ZIP refreshed into Cloud Storage by the scheduled updater. */
  staticFeedUrl: string;
  /** App fallback routes/stops that must remain operational before an update is published. */
  requiredStaticFallbacks?: readonly { routeId: string; stopIds: readonly string[] }[];
  /**
   * True when opposite directions use distinct stop_ids and direction must be read from which
   * stop a trip hits (with or without a parent_station link). False when one stop_id serves both
   * directions and direction_id can be trusted.
   */
  directionalStops: boolean;
  /**
   * Whether the realtime feed's trip_ids match the static schedule's, so a timetable entry
   * can be dropped exactly when its trip is already tracked live (see gtfsSchedule.ts) —
   * confirmed matching for LIRR and Suffolk County Transit (e.g. live "265-2429" is trips.txt's
   * "265-2429" exactly); confirmed *not* matching for NYC Subway (live "086750_E..N66R" vs
   * static "BSP26GEN-E049-Sunday-00_001400_E..S04R") or NICE Bus (live trip_ids like "2044028"
   * don't appear in trips.txt at all). When false, the timetable still pads live predictions,
   * but only with departures after the last live one, so a tracked trip isn't listed twice.
   */
  realtimeTripIdsMatchStatic: boolean;
  /** Raises the snapshot size guards for a feed bigger than the defaults allow. */
  snapshotLimits?: Partial<GtfsSnapshotLimits>;
  /**
   * Route timetables and geometry are fetched from Cloud Storage per route on first use instead of
   * being copied into every instance's /tmp (held in memory) at hydration: for feeds too big for that.
   * Such an agency has no committed static_data/ copy, and is skipped until a snapshot is published.
   */
  onDemandRouteFiles?: boolean;
  /** Secret (an env var at runtime) the live feed needs; a feed without one is public. */
  liveFeedSecret?: 'SWIFTLY_API_KEY' | 'MTA_BUS_TIME_API_KEY';
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

/**
 * MTA Bus Time's GTFS-RT: one system-wide feed for every NYCT and MTA Bus Company route, split
 * into trip updates and vehicle positions. The key goes in the query string, as Bus Time requires
 * (`firebase functions:secrets:set MTA_BUS_TIME_API_KEY`; injected into `process.env` by the live
 * callables' `secrets` option). gtfsRealtime.ts leaves the query string out of its error messages.
 */
function busTimeFeedRequests(): FeedRequest[] {
  const key = encodeURIComponent(process.env.MTA_BUS_TIME_API_KEY ?? '');
  return [
    { url: `https://gtfsrt.prod.obanyc.com/tripUpdates?key=${key}` },
    { url: `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=${key}` },
  ];
}

/**
 * Bus feeds measured 2026-10-14: Brooklyn's ZIP is 19.6 MB and unpacks to 164.5 MB with 2.4M stop
 * times (the largest); limits leave room to grow.
 */
const BUS_SNAPSHOT_LIMITS = {
  archiveBytes: 32 * 1024 * 1024,
  extractedBytes: 400 * 1024 * 1024,
  stopTimeRows: 6_000_000,
} as const;

function mtaBusConfig(id: BusAgencyId, feed: string): AgencyConfig {
  return {
    id,
    displayName: 'MTA Bus',
    dataDir: id,
    staticFeedUrl: `https://rrgtfsfeeds.s3.amazonaws.com/${feed}.zip`,
    // One stop_id per side of the street, with no parent_station (like NICE and Suffolk).
    directionalStops: true,
    // Bus Time's trip_ids appear in the borough feeds' trips.txt (sampled 2026-10-14).
    realtimeTripIdsMatchStatic: true,
    snapshotLimits: BUS_SNAPSHOT_LIMITS,
    onDemandRouteFiles: true,
    liveFeedSecret: 'MTA_BUS_TIME_API_KEY',
    feedRequestsForRoute: () => busTimeFeedRequests(),
  };
}

export const AGENCY_CONFIGS: Record<AgencyId, AgencyConfig> = {
  lirr: {
    id: 'lirr',
    displayName: 'LIRR',
    dataDir: 'lirr',
    staticFeedUrl: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip',
    requiredStaticFallbacks: [{ routeId: '10', stopIds: ['14'] }],
    directionalStops: false,
    realtimeTripIdsMatchStatic: true,
    feedRequestsForRoute: () => [{ url: LIRR_FEED_URL }],
  },
  subway: {
    id: 'subway',
    displayName: 'MTA Subway',
    dataDir: 'subway',
    staticFeedUrl: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip',
    requiredStaticFallbacks: [
      { routeId: 'E', stopIds: ['G06S', 'G06N'] },
      { routeId: '7', stopIds: ['701S', '701N'] },
    ],
    directionalStops: true,
    realtimeTripIdsMatchStatic: false,
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
    staticFeedUrl: 'https://www.nicebus.com/NICE/media/nicebus-gtfs/NICE_GTFS.zip',
    requiredStaticFallbacks: [{ routeId: 'n4', stopIds: ['2004', '4538'] }],
    realtimeTripIdsMatchStatic: false,
    liveFeedSecret: 'SWIFTLY_API_KEY',
    feedRequestsForRoute: () => swiftlyFeedRequests('nice-bus'),
  },
  suffolk: {
    id: 'suffolk',
    displayName: 'Suffolk County Transit',
    // Same direction-paired-stops, no-parent_station situation as NICE Bus above.
    directionalStops: true,
    dataDir: 'suffolk',
    staticFeedUrl: 'https://tracksctbus.org/gtfs',
    requiredStaticFallbacks: [
      { routeId: '6859', stopIds: ['11420858', '11259869'] },
      { routeId: '6868', stopIds: ['11283786', '11283946'] },
    ],
    realtimeTripIdsMatchStatic: true,
    liveFeedSecret: 'SWIFTLY_API_KEY',
    feedRequestsForRoute: () => swiftlyFeedRequests('suffolk-county'),
  },
  bx: mtaBusConfig('bx', 'gtfs_bx'),
  bk: mtaBusConfig('bk', 'gtfs_b'),
  mn: mtaBusConfig('mn', 'gtfs_m'),
  qn: mtaBusConfig('qn', 'gtfs_q'),
  si: mtaBusConfig('si', 'gtfs_si'),
  busco: mtaBusConfig('busco', 'gtfs_busco'),
  nycferry: {
    id: 'nycferry',
    displayName: 'NYC Ferry',
    dataDir: 'nycferry',
    staticFeedUrl: 'https://nycferry.connexionz.net/rtt/public/resource/gtfs.zip',
    // A landing is one stop for both directions.
    directionalStops: false,
    // Trip updates name trips by trips.txt's trip_id (sampled 2026-10-14), but leave route_id
    // empty; gtfsStatus.ts reads the route from trips.txt.
    realtimeTripIdsMatchStatic: true,
    // Tiny, but published like the buses so nothing needs committing.
    onDemandRouteFiles: true,
    // Trip updates only: NYC Ferry publishes no vehicle positions.
    feedRequestsForRoute: () => [{ url: 'https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate' }],
  },
};

export function agencyConfig(agencyId: AgencyId): AgencyConfig {
  const config = AGENCY_CONFIGS[agencyId];
  if (!config) throw new Error(`Unknown agency "${agencyId}"`);
  return config;
}
