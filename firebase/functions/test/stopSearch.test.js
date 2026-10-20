const assert = require('node:assert/strict');
const test = require('node:test');

const { lookupStations, normalizeStopName, searchStops } = require('../lib/stopSearch');

const STONY_BROOK = { lat: 40.9126, lng: -73.1234 };
const MIDTOWN = { lat: 40.758, lng: -73.9855 };

test('normalizes punctuation, "&", and street words', () => {
  assert.equal(normalizeStopName('Times Sq-42 St'), 'times sq 42 st');
  assert.equal(normalizeStopName('Main Street & 5th Avenue'), 'main st and 5 av');
  assert.equal(normalizeStopName('Times Square-42nd Street'), 'times sq 42 st');
  assert.equal(normalizeStopName('Nicolls Rd.'), 'nicolls rd');
});

test('"jamaica" finds the LIRR and subway Jamaica stations, each once, the exact name first', async () => {
  const results = await searchStops('jamaica', STONY_BROOK);
  assert.equal(results[0].name, 'Jamaica');
  assert.equal(results[0].agencyLabel, 'LIRR');
  assert.equal(results[0].mode, 'rail');
  assert.ok(results.some((stop) => stop.agencyLabel === 'MTA Subway' && stop.name.startsWith('Jamaica')));
  assert.equal(new Set(results.map((stop) => stop.id)).size, results.length);
});

test('a subway complex is one entry with every line, in route order', async () => {
  const [timesSquare, ...rest] = await searchStops('times sq', MIDTOWN);
  assert.equal(timesSquare.name, 'Times Sq-42 St');
  assert.ok(rest.every((stop) => stop.name !== 'Times Sq-42 St'));
  const lines = timesSquare.routes.map((route) => route.shortName);
  for (const line of ['1', '2', '3', '7', 'N', 'Q', 'R', 'S', 'W']) assert.ok(lines.includes(line), `serves ${line}`);
  assert.ok(lines.indexOf('1') < lines.indexOf('N'));
  assert.match(timesSquare.routes[0].color, /^#[0-9A-Fa-f]{6}$/);
});

test("a bus stop's two directions merge into one entry", async () => {
  const results = await searchStops('nicolls rd', STONY_BROOK);
  assert.ok(results.length > 0);
  assert.ok(results.every((stop) => stop.mode === 'bus'));
  assert.equal(new Set(results.map((stop) => stop.name)).size, results.length);
});

test('a whole-word match outranks a longer word with the same start', async () => {
  const [first] = await searchStops('penn', MIDTOWN);
  assert.equal(first.name, 'Penn Station');
});

test('the rider’s location breaks ties between equally good matches', async () => {
  const fromMidtown = (await searchStops('34 st', MIDTOWN)).map((stop) => stop.name);
  const fromBrooklyn = (await searchStops('34 st', { lat: 40.6551, lng: -74.0035 })).map((stop) => stop.name);
  assert.notDeepEqual(fromMidtown, fromBrooklyn);
});

test('a one-character query returns nothing', async () => {
  assert.deepEqual(await searchStops('j'), []);
  assert.deepEqual(await searchStops(' - '), []);
});

const { resetCallableSecurityForTests, setSharedRateLimitConsumerForTests } = require('../lib/callableSecurity');
const { searchTransitStops } = require('../lib');

const call = (data, uid = 'search-user') => searchTransitStops.run({ auth: uid ? { uid } : null, data, rawRequest: {} });

test('the callable requires a signed-in rider and consumes a rate-limit token', async () => {
  resetCallableSecurityForTests();
  await assert.rejects(call({ query: 'jamaica' }, null), { code: 'unauthenticated' });
  const consumed = [];
  setSharedRateLimitConsumerForTests(async (key, limit) => {
    consumed.push({ key, limit });
    return { allowed: true, next: { tokens: limit - 1, updatedAtMs: 0 }, retryAfterSeconds: 0 };
  });
  try {
    const { stops } = await call({ query: 'jamaica', near: { lat: 40.9, lng: -73.1 } });
    assert.ok(stops.length > 0);
    assert.equal(consumed.length, 1);
    assert.match(consumed[0].key, /^searchTransitStops:/);
    assert.equal(consumed[0].limit, 60);
  } finally {
    setSharedRateLimitConsumerForTests(undefined);
  }
});

test('the callable rejects an over-long query and bad coordinates', async () => {
  resetCallableSecurityForTests();
  await assert.rejects(call({ query: 'x'.repeat(81) }), { code: 'invalid-argument' });
  await assert.rejects(call({ query: 'jamaica', near: { lat: 'north', lng: 0 } }), { code: 'invalid-argument' });
});

test("finds Google's station suggestions among Pathly's stops, with every line of a complex", async () => {
  const [jamaica, timesSquare, grandCentral, sutphin, unknown] = await lookupStations([
    { name: 'Jamaica Station', kind: 'rail' },
    { name: 'Times Square-42nd Street', kind: 'subway' },
    { name: 'Grand Central', kind: 'subway' },
    { name: 'Sutphin Blvd-Archer Av-JFK Airport', kind: 'subway' },
    { name: 'Nowhere Junction', kind: 'rail' },
  ], MIDTOWN);
  assert.equal(jamaica.name, 'Jamaica');
  assert.equal(jamaica.agencyLabel, 'LIRR');
  assert.equal(timesSquare.name, 'Times Sq-42 St');
  assert.ok(['1', '7', 'N', 'S'].every((line) => timesSquare.routes.some((route) => route.shortName === line)));
  assert.ok(['4', '5', '6', '7', 'S'].every((line) => grandCentral.routes.some((route) => route.shortName === line)));
  assert.deepEqual(sutphin.routes.map((route) => route.shortName), ['E', 'J', 'Z']);
  assert.equal(unknown, null);
});

test('a station complex is one search result', async () => {
  const names = (await searchStops('grand central', MIDTOWN)).map((stop) => `${stop.agencyLabel}:${stop.name}`);
  assert.equal(names.filter((name) => name === 'MTA Subway:Grand Central-42 St').length, 1);
});

test('the callable looks up station names and validates them', async () => {
  resetCallableSecurityForTests();
  const { stations } = await call({ stations: [{ name: 'Jamaica Station', kind: 'rail' }] });
  assert.equal(stations[0].name, 'Jamaica');
  await assert.rejects(call({ stations: [{ name: 'Jamaica', kind: 'tram' }] }), { code: 'invalid-argument' });
  await assert.rejects(call({ stations: Array.from({ length: 9 }, () => ({ name: 'Jamaica', kind: 'rail' })) }), { code: 'invalid-argument' });
});
