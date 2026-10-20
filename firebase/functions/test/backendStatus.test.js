const assert = require('node:assert/strict');
const test = require('node:test');

const { collectBackendStatus } = require('../lib/backendStatus');
const { resetCallableSecurityForTests } = require('../lib/callableSecurity');
const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const { getBackendStatus } = require('../lib');

const run = (email) => getBackendStatus.run({ auth: { uid: 'status-user', token: { email } }, data: {}, rawRequest: {} });
const published = async () => ({ state: 'published', version: 'abc', publishedAt: '2026-10-14T00:00:00Z', serviceEndDate: '20261231', hasDerived: true });

test.beforeEach(() => resetCallableSecurityForTests());
test.afterEach(() => {
  delete process.env.SWIFTLY_API_KEY;
  delete process.env.MTA_BUS_TIME_API_KEY;
});

test('rejects a non-admin before doing any work', async () => {
  const originalFetch = global.fetch;
  let fetched = false;
  global.fetch = async () => { fetched = true; return new Response(''); };
  try {
    await assert.rejects(run('rider@gmail.com'), { code: 'permission-denied' });
    assert.equal(fetched, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reports one entry per agency with snapshot age and live feed health', async () => {
  process.env.SWIFTLY_API_KEY = 'test-key';
  process.env.MTA_BUS_TIME_API_KEY = 'test-bus-key';
  const agencies = await collectBackendStatus({
    readSnapshot: published,
    readLastRefresh: async () => ({ at: '2026-10-14T05:00:00Z', ok: true, result: 'unchanged' }),
    fetch: async () => new Response('feed', { status: 200 }),
    nowMs: Date.parse('2026-10-14T12:00:00Z'),
  });
  assert.deepEqual(agencies.map((agency) => agency.agencyId), Object.keys(AGENCY_CONFIGS));
  for (const agency of agencies) {
    assert.equal(agency.ageHours, 12);
    assert.equal(agency.lastRefresh.ok, true);
    // The Staten Island Ferry publishes no live feed: timetable only.
    if (agency.agencyId === 'siferry') {
      assert.deepEqual(agency.live, { configured: false });
      continue;
    }
    assert.equal(agency.live.configured, true);
    assert.equal(agency.live.ok, true);
    assert.equal(agency.lastRefresh.ok, true);
  }
});

test('marks a feed without its secret as unconfigured, and never returns secret values', async () => {
  const agencies = await collectBackendStatus({ readSnapshot: published, readLastRefresh: async () => null, fetch: async () => new Response(''), nowMs: Date.now() });
  const nice = agencies.find((agency) => agency.agencyId === 'nice');
  assert.deepEqual(nice.live, { configured: false });
  assert.deepEqual(agencies.find((agency) => agency.agencyId === 'bk').live, { configured: false });
  assert.doesNotMatch(JSON.stringify(agencies), /test-key/);
});

test('a hanging feed reports ok: false within the timeout', async () => {
  const hanging = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const started = Date.now();
  const agencies = await collectBackendStatus({ readSnapshot: published, readLastRefresh: async () => null, fetch: hanging, nowMs: Date.now(), timeoutMs: 100 });
  assert.ok(Date.now() - started < 2_000);
  assert.equal(agencies.find((agency) => agency.agencyId === 'lirr').live.ok, false);
});

test('a snapshot read failure is reported, not thrown', async () => {
  const agencies = await collectBackendStatus({ readSnapshot: async () => { throw new Error('bucket offline'); }, readLastRefresh: async () => null, fetch: async () => new Response(''), nowMs: Date.now() });
  assert.deepEqual(agencies[0].snapshot, { state: 'error', message: 'bucket offline' });
});
