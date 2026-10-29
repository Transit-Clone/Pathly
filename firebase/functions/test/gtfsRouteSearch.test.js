const assert = require('node:assert/strict');
const test = require('node:test');

const { getRouteTransfers, searchRoutes } = require('../lib/gtfsDiscovery');

// Bowling Green, Lower Manhattan.
const MANHATTAN = [40.7046, -74.0139];

test('searching "1" puts the 1 train first', async () => {
  const routes = await searchRoutes('1', ...MANHATTAN);
  assert.ok(routes.length > 0);
  assert.equal(routes[0].agencyId, 'subway');
  assert.equal(routes[0].shortName, '1');
  assert.ok(routes[0].direction1 || routes[0].direction0, 'it carries a stop to open at');
});

test('a branch name finds the LIRR line', async () => {
  const routes = await searchRoutes('port jeff', 40.9203, -73.1285);
  assert.ok(routes.some((route) => route.agencyId === 'lirr' && route.routeId === '10'));
});

test('a query matching nothing finds nothing', async () => {
  assert.deepEqual(await searchRoutes('zzzz', ...MANHATTAN), []);
});

test('Times Sq on the 1 lists other subway lines as transfers', async () => {
  const transfers = await getRouteTransfers('subway', '1', 0);
  const entries = Object.entries(transfers);
  assert.ok(entries.length > 0);
  const timesSq = entries.find(([stopId]) => stopId.startsWith('127'));
  assert.ok(timesSq, 'Times Sq-42 St has transfers');
  const names = timesSq[1].map((transfer) => transfer.shortName);
  for (const line of ['2', '3', '7', 'N', 'Q']) assert.ok(names.includes(line), `${line} at Times Sq (${names.join(' ')})`);
  assert.ok(!timesSq[1].some((transfer) => transfer.agencyId === 'subway' && transfer.routeId === '1'), 'not the line itself');
});

test('a mode or agency word lists that kind of line ("subway", "lirr")', async () => {
  const subway = await searchRoutes('subway', ...MANHATTAN);
  assert.ok(subway.length > 6, 'more than the old cap of six');
  assert.ok(subway.every((route) => route.agencyId === 'subway'));
  assert.deepEqual(subway.slice(0, 3).map((route) => route.shortName), ['1', '2', '3']);
  const lirr = await searchRoutes('lirr', 40.9203, -73.1285);
  assert.ok(lirr.some((route) => route.routeId === '10'), 'Port Jefferson Branch');
});
