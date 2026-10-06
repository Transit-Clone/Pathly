import { transit_realtime } from 'gtfs-realtime-bindings';

// One real GTFS-RT fetch already contains every route on that feed — getRouteStatus calls this
// once per *route* it's asked about, though, so polling N routes on the same agency in one
// client poll cycle would otherwise mean N identical fetches of the exact same feed. That's
// wasteful generally, and a real problem for rate-limited providers: Swiftly (NICE Bus/Suffolk
// County Transit) allows 180 requests/15min, which a handful of simultaneously-tracked routes
// (the demo catalog plus whatever's dynamically nearby) can exceed easily without this. Caching
// the in-flight *promise* (not just the resolved value) per feed URL, briefly, means every
// route asking for the same feed within one poll cycle shares a single real request — this
// benefits every agency, not just rate-limited ones, so it's not Swiftly-specific.
const FEED_CACHE_TTL_MS = 25_000; // a little under the client's 30s poll interval
const feedCache = new Map<string, { expiresAt: number; promise: Promise<transit_realtime.FeedEntity[]> }>();

/**
 * Fetches and decodes one live GTFS-RT feed. No API key needed for any MTA feed (LIRR,
 * subway); Swiftly-hosted feeds (NICE Bus, Suffolk County Transit) need an `Authorization`
 * header, passed via `headers` rather than hand-building a request per agency.
 */
export function fetchFeedEntities(feedUrl: string, headers?: Record<string, string>): Promise<transit_realtime.FeedEntity[]> {
  const cached = feedCache.get(feedUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const response = await fetch(feedUrl, headers ? { headers } : undefined);
    if (!response.ok) throw new Error(`GTFS-RT request to ${feedUrl} failed: ${response.status}`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    return transit_realtime.FeedMessage.decode(buffer).entity;
  })();
  // A failed fetch shouldn't keep being replayed to every route asking for this feed until the
  // TTL expires — clear it immediately so the next caller gets a fresh attempt instead.
  promise.catch(() => feedCache.delete(feedUrl));
  feedCache.set(feedUrl, { expiresAt: Date.now() + FEED_CACHE_TTL_MS, promise });
  return promise;
}
