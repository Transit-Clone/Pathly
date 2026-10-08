const assert = require('node:assert/strict');
const test = require('node:test');

const { findNearbyTransit, pickNearbyRoutes } = require('../lib/gtfsDiscovery');

const route = (routeId, distanceMeters, agencyId = 'suffolk') => ({ agencyId, routeId, distanceMeters });
const ids = (routes) => routes.map((item) => item.routeId);
const isSorted = (routes) => routes.every((item, index) => index === 0 || item.distanceMeters >= routes[index - 1].distanceMeters);

test('a sparse area adds only the closest extra routes needed to reach six', () => {
  const base = [route('a', 300), route('b', 900)];
  // Twenty more routes come into range once the search widens.
  const wider = [...base, ...Array.from({ length: 20 }, (_, index) => route(`far-${index}`, 5_000 - index * 100))];
  const picked = pickNearbyRoutes(base, wider, 6, 40);
  assert.equal(picked.length, 6);
  assert.deepEqual(ids(picked), ['a', 'b', 'far-19', 'far-18', 'far-17', 'far-16']);
  assert.ok(isSorted(picked));
});

test('a dense area lists every route within the base radius, without extras', () => {
  const base = Array.from({ length: 25 }, (_, index) => route(`r${index}`, 50 * (25 - index), 'subway'));
  const picked = pickNearbyRoutes(base, [...base, route('far', 9_000)], 6, 40);
  assert.equal(picked.length, 25);
  assert.ok(!ids(picked).includes('far'));
  assert.ok(isSorted(picked));
});

test('the safety cap only bounds pathological lists', () => {
  const base = Array.from({ length: 50 }, (_, index) => route(`r${index}`, index));
  assert.equal(pickNearbyRoutes(base, base, 6, 40).length, 40);
});

test('Stony Brook widens only to six routes', async () => {
  const routes = await findNearbyTransit(40.9203, -73.1285);
  assert.equal(routes.length, 6);
  assert.ok(isSorted(routes));
  assert.ok(routes.some((item) => item.agencyId === 'lirr' && item.routeId === '10'), 'the Port Jefferson Branch is listed');
  // Nothing from the far edge of the widest search (the old rule reached ~29 km out).
  assert.ok(routes.every((item) => item.distanceMeters < 10_000));
});

test('Midtown lists every route within walking range without widening', async () => {
  const routes = await findNearbyTransit(40.7549, -73.9840);
  assert.ok(routes.length > 25, `expected a long list, got ${routes.length}`);
  assert.ok(isSorted(routes));
  // Every subway route is within the subway's 1.6 km base radius: the search never widened.
  assert.ok(routes.filter((item) => item.agencyId === 'subway').every((item) => item.distanceMeters <= 1_600));
});
