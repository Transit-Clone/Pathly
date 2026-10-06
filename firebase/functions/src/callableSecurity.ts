import { createHash } from 'node:crypto';

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type CallableRateLimit = {
  /** Token capacity/refill rate per minute for one authenticated Firebase user. */
  userPerMinute: number;
  /** A generous secondary token bucket for shared networks. Skipped without a trusted IP. */
  ipPerMinute: number;
};

type TokenBucket = { tokens: number; updatedAtMs: number; lastSeenAtMs: number };

const WINDOW_MS = 60_000;
const IDLE_BUCKET_TTL_MS = 10 * WINDOW_MS;
const MAX_BUCKETS = 20_000;
const buckets = new Map<string, TokenBucket>();
let callsSincePrune = 0;

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Cloud Functions exposes Express' normalized request IP. Avoid parsing a caller-controlled
 * X-Forwarded-For header ourselves; the IP limit is only a secondary control anyway because
 * campuses and carriers legitimately put many riders behind one address.
 */
function clientIp<T>(request: CallableRequest<T>): string | null {
  const ip = request.rawRequest.ip?.trim() || request.rawRequest.socket.remoteAddress?.trim();
  return ip || null;
}

function pruneBuckets(nowMs: number): void {
  callsSincePrune += 1;
  if (callsSincePrune < 250 && buckets.size <= MAX_BUCKETS) return;
  callsSincePrune = 0;

  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.lastSeenAtMs > IDLE_BUCKET_TTL_MS) buckets.delete(key);
  }

  if (buckets.size <= MAX_BUCKETS) return;
  const oldest = [...buckets.entries()].sort((a, b) => a[1].lastSeenAtMs - b[1].lastSeenAtMs);
  for (const [key] of oldest.slice(0, buckets.size - MAX_BUCKETS)) buckets.delete(key);
}

/** Exported for deterministic unit tests; production callers use enforceCallableSecurity. */
export function consumeTokenBucket(
  current: Pick<TokenBucket, 'tokens' | 'updatedAtMs'> | undefined,
  capacityPerMinute: number,
  nowMs: number,
): { allowed: boolean; next: Pick<TokenBucket, 'tokens' | 'updatedAtMs'>; retryAfterSeconds: number } {
  if (!current) {
    return {
      allowed: true,
      next: { tokens: capacityPerMinute - 1, updatedAtMs: nowMs },
      retryAfterSeconds: 0,
    };
  }

  const elapsedMs = Math.max(0, nowMs - current.updatedAtMs);
  const refill = (elapsedMs / WINDOW_MS) * capacityPerMinute;
  const available = Math.min(capacityPerMinute, current.tokens + refill);
  if (available < 1) {
    const missingTokens = 1 - available;
    return {
      allowed: false,
      next: current,
      retryAfterSeconds: Math.max(1, Math.ceil((missingTokens * WINDOW_MS) / capacityPerMinute / 1_000)),
    };
  }

  return {
    allowed: true,
    next: { tokens: available - 1, updatedAtMs: nowMs },
    retryAfterSeconds: 0,
  };
}

function bucketDecision(key: string, limit: number, nowMs: number) {
  const current = buckets.get(key);
  return { key, result: consumeTokenBucket(current, limit, nowMs) };
}

/**
 * Fail closed before any transit/provider work starts. Buckets intentionally store only hashes,
 * never raw Firebase UIDs or IP addresses. The limiter is per warm instance, and every callable
 * is capped at one instance to make that boundary coherent; use a shared gateway/Redis limiter
 * before raising the ceiling for production scale. A cold start still resets the buckets, so
 * provider quotas and billing alerts remain the hard cost backstop.
 */
export function enforceCallableSecurity<T>(
  request: CallableRequest<T>,
  endpoint: string,
  limits: CallableRateLimit,
  nowMs = Date.now(),
): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');

  pruneBuckets(nowMs);
  const decisions = [bucketDecision(`${endpoint}:user:${hashIdentifier(uid)}`, limits.userPerMinute, nowMs)];

  const ip = clientIp(request);
  if (ip) decisions.push(bucketDecision(`${endpoint}:ip:${hashIdentifier(ip)}`, limits.ipPerMinute, nowMs));

  const blocked = decisions.find(({ result }) => !result.allowed);
  if (blocked) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.', {
      retryAfterSeconds: blocked.result.retryAfterSeconds,
    });
  }

  // Commit neither quota when either scope rejects the request.
  for (const { key, result } of decisions) {
    buckets.set(key, { ...result.next, lastSeenAtMs: nowMs });
  }
  return uid;
}

/** Unit-test isolation only. */
export function resetCallableSecurityForTests(): void {
  buckets.clear();
  callsSincePrune = 0;
}
