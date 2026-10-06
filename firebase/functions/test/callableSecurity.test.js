const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  consumeTokenBucket,
  enforceCallableSecurity,
  resetCallableSecurityForTests,
  setSharedRateLimitConsumerForTests,
} = require('../lib/callableSecurity');
const {
  findNearbyTransit,
  geocodeAddress,
  getNearestRouteStop,
  getRouteGeometry,
  getRouteLiveStatus,
} = require('../lib');

function request(uid) {
  return {
    auth: uid ? { uid } : null,
    rawRequest: {},
  };
}

test.beforeEach(() => resetCallableSecurityForTests());

test('requires an authenticated Firebase user', async () => {
  await assert.rejects(
    enforceCallableSecurity(request(null), 'endpoint', { userPerMinute: 2 }, 1_000),
    (error) => error.code === 'unauthenticated',
  );
});

test('every callable rejects anonymous traffic before validation or provider work', async () => {
  for (const callable of [findNearbyTransit, geocodeAddress, getNearestRouteStop, getRouteGeometry, getRouteLiveStatus]) {
    await assert.rejects(
      () => callable.run({ auth: null, data: {}, rawRequest: request(null).rawRequest }),
      (error) => error.code === 'unauthenticated',
    );
  }
});

test('serializes transit requests so a response cannot mix two GTFS snapshots', () => {
  for (const callable of [findNearbyTransit, getNearestRouteStop, getRouteGeometry]) {
    assert.equal(callable.__endpoint.concurrency, 1);
    assert.equal(callable.__endpoint.maxInstances, 10);
    assert.equal(
      callable.__endpoint.serviceAccountEmail,
      'pathly-callable-runtime@pathly-b7f0f.iam.gserviceaccount.com',
    );
  }
  assert.equal(getRouteLiveStatus.__endpoint.concurrency, 1);
  assert.equal(getRouteLiveStatus.__endpoint.maxInstances, 1);
  assert.equal(
    getRouteLiveStatus.__endpoint.serviceAccountEmail,
    'pathly-callable-runtime@pathly-b7f0f.iam.gserviceaccount.com',
  );
});

test('blocks a user after exhausting the configured token bucket', async () => {
  const limits = { userPerMinute: 2 };
  await enforceCallableSecurity(request('user-1'), 'endpoint', limits, 1_000);
  await enforceCallableSecurity(request('user-1'), 'endpoint', limits, 2_000);
  await assert.rejects(
    enforceCallableSecurity(request('user-1'), 'endpoint', limits, 3_000),
    (error) => error.code === 'resource-exhausted' && error.details.retryAfterSeconds > 0,
  );
});

test('bounds high-cardinality bucket storage without a full-map sort', async () => {
  const limits = { userPerMinute: 1 };
  for (let index = 0; index <= 20_000; index += 1) {
    await enforceCallableSecurity(request(`user-${index}`), 'endpoint', limits, 1_000);
  }

  // The oldest entry was evicted at the cap, so it can be admitted again immediately.
  await assert.doesNotReject(enforceCallableSecurity(request('user-0'), 'endpoint', limits, 1_000));
});

test('keeps endpoint buckets independent and resets after one minute', async () => {
  const limits = { userPerMinute: 1 };
  await enforceCallableSecurity(request('user-1'), 'endpoint-a', limits, 1_000);
  await enforceCallableSecurity(request('user-1'), 'endpoint-b', limits, 2_000);
  await assert.doesNotReject(enforceCallableSecurity(request('user-1'), 'endpoint-a', limits, 61_000));
});

test('enforces a shared rate limit when requests are spread across instances', async () => {
  let sharedBucket;
  setSharedRateLimitConsumerForTests(async (_key, limit, nowMs) => {
    const result = consumeTokenBucket(sharedBucket, limit, nowMs);
    if (result.allowed) sharedBucket = result.next;
    return result;
  });

  await enforceCallableSecurity(request('user-1'), 'endpoint', { userPerMinute: 1 }, 1_000);
  resetCallableSecurityForTests();
  setSharedRateLimitConsumerForTests(async (_key, limit, nowMs) => {
    const result = consumeTokenBucket(sharedBucket, limit, nowMs);
    if (result.allowed) sharedBucket = result.next;
    return result;
  });
  await assert.rejects(
    enforceCallableSecurity(request('user-1'), 'endpoint', { userPerMinute: 1 }, 2_000),
    (error) => error.code === 'resource-exhausted',
  );
});

test('refills token buckets continuously with deterministic retry timing', () => {
  const blocked = consumeTokenBucket({ tokens: 0, updatedAtMs: 1_000 }, 1, 30_001);
  assert.deepEqual(blocked, {
    allowed: false,
    next: { tokens: 0, updatedAtMs: 1_000 },
    retryAfterSeconds: 31,
  });

  const reset = consumeTokenBucket({ tokens: 0, updatedAtMs: 1_000 }, 1, 61_000);
  assert.equal(reset.allowed, true);
  assert.deepEqual(reset.next, { tokens: 0, updatedAtMs: 61_000 });
});

test('rejects object-prototype agency names as invalid arguments', async () => {
  for (const agencyId of ['constructor', 'toString', '__proto__']) {
    await assert.rejects(
      () => getRouteGeometry.run({
        auth: { uid: 'user-1' },
        data: { agencyId, routeId: 'E', directionId: 0 },
        rawRequest: request('user-1').rawRequest,
      }),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('rejects route IDs outside the selected agency before scanning stop_times', async () => {
  const originalCreateReadStream = fs.createReadStream;
  let stopTimesScans = 0;
  fs.createReadStream = function (...args) {
    stopTimesScans += 1;
    return originalCreateReadStream.apply(this, args);
  };

  try {
    const cases = [
      // n1 is a real NICE route, but it is not a valid route in the selected subway dataset.
      [getNearestRouteStop, { agencyId: 'subway', routeId: 'n1', lat: 40.7, lon: -73.9 }],
      [getRouteGeometry, { agencyId: 'subway', routeId: 'n1', directionId: 0 }],
    ];

    for (const [callable, data] of cases) {
      await assert.rejects(
        () => callable.run({ auth: { uid: 'user-1' }, data, rawRequest: request('user-1').rawRequest }),
        (error) => error.code === 'invalid-argument' && error.message.includes('routeId is not supported'),
      );
    }
  } finally {
    fs.createReadStream = originalCreateReadStream;
  }

  assert.equal(stopTimesScans, 0);
});
