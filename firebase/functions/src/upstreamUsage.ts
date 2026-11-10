import { logger } from 'firebase-functions';

/**
 * One structured log line per real request to a live-data provider (cache hits are not logged),
 * so Cloud Logging can count usage against provider quotas — Swiftly allows 180 requests/15min
 * per key. Query: jsonPayload.event="upstream_feed_request" AND jsonPayload.provider="swiftly".
 */
export type UpstreamCaller = 'feed' | 'health_check';

export function providerForUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'unknown';
  }
  if (host === 'api.goswift.ly') return 'swiftly';
  if (host.endsWith('obanyc.com')) return 'mta_bus_time';
  if (host.endsWith('mta.info')) return 'mta';
  return host;
}

/** Path only: MTA Bus Time puts its API key in the query string. */
function feedPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** Rate-limit headers, when the provider sends them (names vary by provider). */
function rateLimitHeaders(response: Response | undefined): Record<string, string> | undefined {
  if (!response) return undefined;
  const found: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name.includes('ratelimit') || name === 'retry-after') found[name] = value;
  });
  return Object.keys(found).length > 0 ? found : undefined;
}

export function logUpstreamRequest(url: string, caller: UpstreamCaller, startedAt: number, response?: Response, error?: unknown): void {
  const rateLimit = rateLimitHeaders(response);
  logger.info('Upstream feed request', {
    event: 'upstream_feed_request',
    provider: providerForUrl(url),
    feed: feedPath(url),
    caller,
    status: response?.status ?? null,
    ok: response?.ok ?? false,
    ms: Date.now() - startedAt,
    ...(rateLimit ? { rateLimit } : {}),
    ...(error && !response ? { reason: error instanceof Error ? error.message : String(error) } : {}),
  });
}
