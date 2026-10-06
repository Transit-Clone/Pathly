const assert = require('node:assert/strict');
const test = require('node:test');

const {
  consumeTokenBucket,
  enforceCallableSecurity,
  resetCallableSecurityForTests,
} = require('../lib/callableSecurity');
const {
  findNearbyTransit,
  geocodeAddress,
  getNearestRouteStop,
  getRouteGeometry,
  getRouteLiveStatus,
} = require('../lib');

function request(uid, ip = '203.0.113.10') {
  return {
    auth: uid ? { uid } : null,
    rawRequest: { ip, socket: { remoteAddress: ip } },
  };
}

test.beforeEach(() => resetCallableSecurityForTests());

test('requires an authenticated Firebase user', () => {
  assert.throws(
    () => enforceCallableSecurity(request(null), 'endpoint', { userPerMinute: 2, ipPerMinute: 10 }, 1_000),
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

test('blocks a user after exhausting the configured token bucket', () => {
  const limits = { userPerMinute: 2, ipPerMinute: 10 };
  enforceCallableSecurity(request('user-1'), 'endpoint', limits, 1_000);
  enforceCallableSecurity(request('user-1'), 'endpoint', limits, 2_000);
  assert.throws(
    () => enforceCallableSecurity(request('user-1'), 'endpoint', limits, 3_000),
    (error) => error.code === 'resource-exhausted' && error.details.retryAfterSeconds > 0,
  );
});

test('applies the IP ceiling across users without burning rejected user quota', () => {
  const limits = { userPerMinute: 2, ipPerMinute: 1 };
  enforceCallableSecurity(request('user-1'), 'endpoint', limits, 1_000);
  assert.throws(
    () => enforceCallableSecurity(request('user-2'), 'endpoint', limits, 2_000),
    (error) => error.code === 'resource-exhausted',
  );

  // A request from a different network still gets user-2's full two-token allowance.
  enforceCallableSecurity(request('user-2', '198.51.100.20'), 'endpoint', limits, 2_000);
  assert.doesNotThrow(() => enforceCallableSecurity(request('user-2', '198.51.100.21'), 'endpoint', limits, 2_000));
});

test('keeps endpoint buckets independent and resets after one minute', () => {
  const limits = { userPerMinute: 1, ipPerMinute: 10 };
  enforceCallableSecurity(request('user-1'), 'endpoint-a', limits, 1_000);
  enforceCallableSecurity(request('user-1'), 'endpoint-b', limits, 2_000);
  assert.doesNotThrow(() => enforceCallableSecurity(request('user-1'), 'endpoint-a', limits, 61_000));
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
