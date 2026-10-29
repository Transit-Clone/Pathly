const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { consumeTokenBucket, resetCallableSecurityForTests, setSharedRateLimitConsumerForTests } = require('../lib/callableSecurity');
const { planTrip, requiredPlanTripRequest, setTripAlertsLookupForTests, setTripStopMatcherForTests } = require('../lib');
const { SERVICE_AREA_BOUNDS } = require('../lib/serviceArea');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const validData = {
  origin: { lat: 40.9126, lng: -73.1234, label: 'Current location' },
  destination: { placeId: 'ChIJ-penn', label: 'Penn Station' },
  time: { mode: 'now' },
  preference: 'fastest',
  modes: ['subway', 'bus', 'rail'],
};
const run = (data, uid = 'trip-user') => planTrip.run({ auth: uid ? { uid } : null, data, rawRequest: {} });

let fetchCalls;
let originalFetch;
test.beforeEach(() => {
  resetCallableSecurityForTests();
  fetchCalls = [];
  originalFetch = global.fetch;
  // Line alerts come from their own feed; these tests count only the Routes API call.
  setTripAlertsLookupForTests(async () => []);
});
test.afterEach(() => {
  global.fetch = originalFetch;
  setTripStopMatcherForTests(undefined);
  setTripAlertsLookupForTests(undefined);
  setSharedRateLimitConsumerForTests(undefined);
});

/** Answers the Routes API call with `body` (and records the request). */
function stubRoutes(body, status = 200) {
  global.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

test('plans real itineraries through the Routes API with the field mask and alternatives', async () => {
  stubRoutes(fixture('routes-sbu-penn.json'));
  const { itineraries } = await run(validData);
  assert.ok(itineraries.length >= 2);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.match(fetchCalls[0].init.headers['X-Goog-FieldMask'], /routes\.legs\.steps\.transitDetails/);
  const sent = JSON.parse(fetchCalls[0].init.body);
  assert.equal(sent.travelMode, 'TRANSIT');
  assert.equal(sent.computeAlternativeRoutes, true);
  assert.deepEqual(sent.destination, { placeId: 'ChIJ-penn' });
});

test('requires a signed-in rider and consumes a rate-limit token', async () => {
  stubRoutes({ routes: [] });
  await assert.rejects(() => run(validData, null), (error) => error.code === 'unauthenticated');
  const consumed = [];
  setSharedRateLimitConsumerForTests(async (key, limit, nowMs) => {
    consumed.push(key.split(':')[0]);
    return consumeTokenBucket(undefined, limit, nowMs);
  });
  await run(validData);
  assert.deepEqual(consumed, ['planTrip']);
  assert.equal(fetchCalls.length, 1, 'the anonymous call never reached Google');
});

test('rejects endpoints outside the service area before calling Google', async () => {
  stubRoutes({ routes: [] });
  await assert.rejects(
    () => run({ ...validData, destination: { lat: 42.36, lng: -71.06, label: 'Boston' } }),
    (error) => error.code === 'invalid-argument' && error.details?.reason === 'out-of-area',
  );
  assert.equal(fetchCalls.length, 0);
});

test('rejects a place-only endpoint that Google locates outside the service area', async () => {
  const raw = JSON.parse(fixture('routes-sbu-penn.json'));
  raw.routes[0].legs[0].endLocation = { latLng: { latitude: 42.36, longitude: -71.06 } };
  stubRoutes(raw);
  await assert.rejects(() => run(validData), (error) => error.details?.reason === 'out-of-area');
});

test('maps a Google failure to unavailable and an empty answer to no itineraries', async () => {
  stubRoutes({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Routes API has not been used' } }, 403);
  await assert.rejects(() => run(validData), (error) => error.code === 'unavailable');

  global.fetch = async () => {
    throw new Error('network down');
  };
  await assert.rejects(() => run(validData), (error) => error.code === 'unavailable');

  stubRoutes({});
  assert.deepEqual(await run(validData), { itineraries: [] });
});

test('validates the request shape and the plannable time window', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const bad = (patch) => assert.throws(() => requiredPlanTripRequest({ ...validData, ...patch }, now), (error) => error.details?.reason === 'bad-request');
  bad({ origin: { label: 'Nowhere' } });
  bad({ origin: { placeId: 'bad id!', label: 'X' } });
  bad({ preference: 'scenic' });
  bad({ modes: [] });
  bad({ modes: ['ferry'] });
  bad({ time: { mode: 'depart', at: 'soon' } });
  bad({ time: { mode: 'depart', at: '2026-10-01T12:00:00Z' } });
  bad({ time: { mode: 'arrive', at: '2027-03-01T12:00:00Z' } });
  const ok = requiredPlanTripRequest({ ...validData, time: { mode: 'arrive', at: '2026-10-15T16:00:00Z' }, modes: ['bus', 'bus'] }, now);
  assert.deepEqual(ok.time, { mode: 'arrive', at: '2026-10-15T16:00:00.000Z' });
  assert.deepEqual(ok.modes, ['bus']);
  bad({ lessWalking: 'yes' });
  assert.equal(requiredPlanTripRequest({ ...validData, lessWalking: true }, now).lessWalking, true);
  assert.equal('lessWalking' in requiredPlanTripRequest({ ...validData, lessWalking: false }, now), false);
});

test('the backend service area matches the app\'s', () => {
  const mobile = fs.readFileSync(path.join(__dirname, '../../../mobile/src/data/serviceArea.ts'), 'utf8');
  for (const [side, value] of Object.entries(SERVICE_AREA_BOUNDS)) {
    assert.match(mobile, new RegExp(`${side}: ${String(value).replace('.', '\\.')},`), `mobile ${side} is ${value}`);
  }
});

test("adds the stops in between to LIRR legs from Pathly's timetables", async () => {
  stubRoutes(fixture('routes-sbu-penn.json'));
  const { itineraries } = await run(validData);
  const lirr = itineraries.flatMap((itinerary) => itinerary.steps).filter((step) => step.kind === 'transit' && step.agency.name === 'Long Island Rail Road');
  assert.ok(lirr.length > 0);
  assert.ok(lirr.every((step) => Array.isArray(step.stops) && step.stops.length > 0));
  assert.deepEqual(Object.keys(lirr[0].stops[0]).sort(), ['location', 'name', 'time']);
});

test('returns itineraries without stops when matching is slower than its budget', async () => {
  stubRoutes(fixture('routes-sbu-penn.json'));
  setTripStopMatcherForTests(() => new Promise(() => undefined));
  const started = Date.now();
  const { itineraries } = await run(validData);
  assert.ok(Date.now() - started < 4_000);
  assert.ok(itineraries.length > 0);
  assert.ok(itineraries.flatMap((itinerary) => itinerary.steps).every((step) => step.stops === undefined));
});
