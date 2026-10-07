import { createHash } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type CallableRateLimit = {
  /** Token capacity/refill rate per minute for one authenticated Firebase user. */
  userPerMinute: number;
};

type TokenBucket = { tokens: number; updatedAtMs: number; lastSeenAtMs: number };

const WINDOW_MS = 60_000;
const IDLE_BUCKET_TTL_MS = 10 * WINDOW_MS;
const MAX_BUCKETS = 20_000;
const SHARED_BUCKET_TTL_MS = 24 * 60 * 60_000;
const SHARED_BUCKET_COLLECTION = '_pathlyCallableRateLimits';
const buckets = new Map<string, TokenBucket>();
let callsSincePrune = 0;
type SharedRateLimitConsumer = (
  key: string,
  limit: number,
  nowMs: number,
) => Promise<ReturnType<typeof consumeTokenBucket>>;
let sharedRateLimitConsumerForTests: SharedRateLimitConsumer | undefined;

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

async function consumeSharedTokenBucket(key: string, limit: number, nowMs: number) {
  if (sharedRateLimitConsumerForTests) return sharedRateLimitConsumerForTests(key, limit, nowMs);
  const app = getApps()[0] ?? initializeApp();
  const firestore = getFirestore(app);
  const reference = firestore.collection(SHARED_BUCKET_COLLECTION).doc(hashIdentifier(key));
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    const current =
      typeof data?.tokens === 'number' && typeof data.updatedAtMs === 'number'
        ? { tokens: data.tokens, updatedAtMs: data.updatedAtMs }
        : undefined;
    const result = consumeTokenBucket(current, limit, nowMs);
    if (result.allowed) {
      transaction.set(reference, {
        expiresAt: new Date(nowMs + SHARED_BUCKET_TTL_MS),
        tokens: result.next.tokens,
        updatedAtMs: result.next.updatedAtMs,
      });
    }
    return result;
  });
}

/**
 * Fail closed before any transit/provider work starts. Buckets intentionally store only hashes,
 * never raw Firebase UIDs. A small in-process bucket rejects obvious bursts cheaply; deployed
 * functions also transact against a shared Firestore bucket so horizontal scaling and cold starts
 * cannot multiply the nominal limit. Cloud Functions' proxy chain does not expose a fixed trusted
 * IP hop, so X-Forwarded-For and Express request.ip must not be used as a security boundary.
 */
export async function enforceCallableSecurity<T>(
  request: CallableRequest<T>,
  endpoint: string,
  limits: CallableRateLimit,
  nowMs = Date.now(),
): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');

  pruneBuckets(nowMs);
  const key = `${endpoint}:user:${hashIdentifier(uid)}`;
  const decision = bucketDecision(key, limits.userPerMinute, nowMs);
  if (!decision.result.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.', {
      retryAfterSeconds: decision.result.retryAfterSeconds,
    });
  }

  if (process.env.K_SERVICE || sharedRateLimitConsumerForTests) {
    let shared;
    try {
      shared = await consumeSharedTokenBucket(key, limits.userPerMinute, nowMs);
    } catch {
      throw new HttpsError('unavailable', 'Request limiting is temporarily unavailable.');
    }
    if (!shared.allowed) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Try again shortly.', {
        retryAfterSeconds: shared.retryAfterSeconds,
      });
    }
  }

  storeBucket(decision.key, { ...decision.result.next, lastSeenAtMs: nowMs });
  return uid;
}

/** Unit-test isolation only. */
export function resetCallableSecurityForTests(): void {
  buckets.clear();
  callsSincePrune = 0;
  sharedRateLimitConsumerForTests = undefined;
}

/** Unit-test dependency injection only. */
export function setSharedRateLimitConsumerForTests(value: SharedRateLimitConsumer): void {
  sharedRateLimitConsumerForTests = value;
}
