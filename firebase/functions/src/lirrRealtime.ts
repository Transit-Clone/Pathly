import { transit_realtime } from 'gtfs-realtime-bindings';

// Confirmed working with no API key required (unlike most other MTA GTFS-RT feeds).
const LIRR_GTFS_RT_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';

/** Fetches and decodes the live LIRR GTFS-RT feed (trip updates + vehicle positions, all branches mixed). */
export async function fetchLirrFeedEntities(): Promise<transit_realtime.FeedEntity[]> {
  const response = await fetch(LIRR_GTFS_RT_URL);
  if (!response.ok) throw new Error(`LIRR GTFS-RT request failed: ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  return transit_realtime.FeedMessage.decode(buffer).entity;
}
