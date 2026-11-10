import { AGENCY_CONFIGS, type AgencyId } from './gtfsAgencies';
import { logUpstreamRequest } from './upstreamUsage';
import { readLastRefreshOutcome, readSnapshotSummary, type GtfsRefreshOutcome, type GtfsSnapshotSummary } from './gtfsSnapshots';

const LIVE_CHECK_TIMEOUT_MS = 3_000;

export type LiveFeedCheck = { configured: boolean; ok?: boolean; ms?: number; status?: number };
export type AgencyStatus = {
  agencyId: AgencyId;
  displayName: string;
  snapshot: GtfsSnapshotSummary | { state: 'error'; message: string };
  ageHours?: number;
  lastRefresh: GtfsRefreshOutcome | null;
  live: LiveFeedCheck;
};

export type BackendStatusDeps = {
  readSnapshot: (agencyId: AgencyId) => Promise<GtfsSnapshotSummary>;
  readLastRefresh: (agencyId: AgencyId) => Promise<GtfsRefreshOutcome | null>;
  fetch: typeof fetch;
  nowMs: number;
  timeoutMs?: number;
};

/** A probe's answer is reused this long, so refreshing the status page doesn't spend rate-limited quota each time. */
const PROBE_CACHE_TTL_MS = 60_000;
const probeCache = new Map<string, { expiresAt: number; status: number }>();

/** Real fetch, with each URL's answer (just its status) remembered briefly. Network errors aren't cached. */
const cachedProbeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const hit = probeCache.get(url);
  if (hit && hit.expiresAt > Date.now()) return new Response(null, { status: hit.status });
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    logUpstreamRequest(url, 'health_check', startedAt, undefined, error);
    throw error;
  }
  logUpstreamRequest(url, 'health_check', startedAt, response);
  probeCache.set(url, { expiresAt: Date.now() + PROBE_CACHE_TTL_MS, status: response.status });
  return response;
};

const defaultDeps = (): BackendStatusDeps => ({
  readSnapshot: readSnapshotSummary,
  readLastRefresh: readLastRefreshOutcome,
  fetch: cachedProbeFetch,
  nowMs: Date.now(),
});

/** Asks an agency's first live feed for a response; reports only reachability, never the secret. */
async function checkLiveFeed(agencyId: AgencyId, deps: BackendStatusDeps): Promise<LiveFeedCheck> {
  const config = AGENCY_CONFIGS[agencyId];
  if (config.liveFeedSecret && !process.env[config.liveFeedSecret]) return { configured: false };
  // Agency-wide feeds ignore the route; split ones (subway) are probed through a known route.
  const routeId = config.requiredStaticFallbacks?.[0]?.routeId ?? '';
  let feed;
  try {
    feed = config.feedRequestsForRoute(routeId)[0];
  } catch {
    feed = undefined;
  }
  if (!feed) return { configured: false };
  const started = Date.now();
  try {
    const response = await deps.fetch(feed.url, { headers: feed.headers, signal: AbortSignal.timeout(deps.timeoutMs ?? LIVE_CHECK_TIMEOUT_MS) });
    await response.body?.cancel();
    return { configured: true, ok: response.ok, ms: Date.now() - started, status: response.status };
  } catch {
    return { configured: true, ok: false, ms: Date.now() - started };
  }
}

async function agencyStatus(agencyId: AgencyId, deps: BackendStatusDeps): Promise<AgencyStatus> {
  const [snapshot, lastRefresh, live] = await Promise.all([
    deps.readSnapshot(agencyId).catch((error: unknown): AgencyStatus['snapshot'] => ({ state: 'error', message: error instanceof Error ? error.message : String(error) })),
    deps.readLastRefresh(agencyId).catch(() => null),
    checkLiveFeed(agencyId, deps),
  ]);
  const ageHours = snapshot.state === 'published' ? Math.round((deps.nowMs - Date.parse(snapshot.publishedAt)) / 36e5 * 10) / 10 : undefined;
  return {
    agencyId,
    displayName: AGENCY_CONFIGS[agencyId].displayName,
    snapshot,
    ...(ageHours !== undefined ? { ageHours } : {}),
    lastRefresh,
    live,
  };
}

/** Every agency's timetable snapshot, last refresh, and live feed health, checked in parallel. */
export function collectBackendStatus(overrides: Partial<BackendStatusDeps> = {}): Promise<AgencyStatus[]> {
  const deps = { ...defaultDeps(), ...overrides };
  return Promise.all((Object.keys(AGENCY_CONFIGS) as AgencyId[]).map((agencyId) => agencyStatus(agencyId, deps)));
}
