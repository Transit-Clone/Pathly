import { transit_realtime } from 'gtfs-realtime-bindings';

/** Fetches and decodes a live GTFS-RT feed (trip updates + vehicle positions). No API key needed for any MTA feed used so far. */
export async function fetchFeedEntities(feedUrl: string): Promise<transit_realtime.FeedEntity[]> {
  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`GTFS-RT request to ${feedUrl} failed: ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  return transit_realtime.FeedMessage.decode(buffer).entity;
}
