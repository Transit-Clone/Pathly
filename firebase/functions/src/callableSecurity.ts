import { createHash } from 'node:crypto';

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type CallableRateLimit = {
  /** Token capacity/refill rate per minute for one authenticated Firebase user. */
  userPerMinute: number;
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

function pruneBuckets(nowMs: number): void {
  callsSincePrune += 1;
  if (callsSincePrune < 250) return;
  callsSincePrune = 0;

  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.lastSeenAtMs > IDLE_BUCKET_TTL_MS) buckets.delete(key);
  }
}

function storeBucket(key: string, bucket: TokenBucket): void {
  // Refresh insertion order so the bounded map acts as an O(1) LRU instead of sorting the
  // entire map under high-cardinality traffic.
  buckets.delete(key);
  buckets.set(key, bucket);
  while (buckets.size > MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
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
 * never raw Firebase UIDs. The limiter is per warm instance, and every callable is capped at one
 * instance to make that boundary coherent; use a managed edge/shared limiter before raising the
 * ceiling or adding IP limits. Cloud Functions' proxy chain does not expose a fixed trusted IP
 * hop, so X-Forwarded-For and Express request.ip must not be used as security boundaries here.
 * A cold start still resets the buckets, so provider quotas and billing alerts remain the hard
 * cost backstop.
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
  const decision = bucketDecision(`${endpoint}:user:${hashIdentifier(uid)}`, limits.userPerMinute, nowMs);
  if (!decision.result.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.', {
      retryAfterSeconds: decision.result.retryAfterSeconds,
    });
  }

  storeBucket(decision.key, { ...decision.result.next, lastSeenAtMs: nowMs });
  return uid;
}

/** Unit-test isolation only. */
export function resetCallableSecurityForTests(): void {
  buckets.clear();
  callsSincePrune = 0;
}
