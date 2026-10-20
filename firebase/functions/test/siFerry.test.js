const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const { findNearbyTransit, getRouteGeometry } = require('../lib/gtfsDiscovery');
const { getStopPredictions } = require('../lib/gtfsSchedule');
const { availableAgencyIds, loadAgencyStaticData, resetGtfsStaticDataForTests, setAgencyDataForTests } = require('../lib/gtfsStaticData');
const { getRouteStatus } = require('../lib/gtfsStatus');
const { agencyIdsForStep } = require('../lib/tripAgencies');

// The fixture is the feed as the refresh job publishes it: directions filled in, and NYC DOT's
// byte-order marks left on routes.txt and stops.txt.
const FIXTURE = path.join(__dirname, 'fixtures', 'gtfs', 'siferry');
const ST_GEORGE = { lat: 40.6437, lng: -74.0736 };
const WHITEHALL = { lat: 40.7013, lng: -74.013 };

let originalFetch;
let fetched;
test.beforeEach(() => {
  resetGtfsStaticDataForTests();
  setAgencyDataForTests('siferry', FIXTURE);
  originalFetch = global.fetch;
  fetched = [];
  global.fetch = async (url) => {
    fetched.push(String(url));
    return new Response('unexpected', { status: 500 });
  };
});
test.afterEach(() => {
  global.fetch = originalFetch;
});

test('the Staten Island Ferry is configured as a timetable-only, on-demand ferry', () => {
  const config = AGENCY_CONFIGS.siferry;
  assert.equal(config.displayName, 'Staten Island Ferry');
  assert.equal(config.staticFeedUrl, 'https://www.nyc.gov/html/dot/downloads/misc/siferry-gtfs.zip');
  assert.match(config.staticFeedHeaders['User-Agent'], /^Mozilla\/5\.0 /);
  assert.equal(config.onDemandRouteFiles, true);
  assert.equal(config.fillTripDirections, true);
  assert.equal(config.terminalShuttle, true);
  assert.equal(config.liveFeedSecret, undefined);
  assert.deepEqual(config.feedRequestsForRoute('SIF'), []);
  assert.deepEqual(config.requiredStaticFallbacks, [{ routeId: 'SIF', stopIds: ['stgeorge', 'whitehall'] }]);
  // Other agencies download with Pathly's own User-Agent.
  assert.equal(AGENCY_CONFIGS.nycferry.staticFeedHeaders, undefined);
});

test('a planned ferry ride may be on either ferry', () => {
  assert.deepEqual(agencyIdsForStep({ agency: { name: 'NYC Ferry' }, mode: 'ferry' }), ['nycferry']);
  assert.deepEqual(agencyIdsForStep({ agency: { name: 'NYC DOT' }, mode: 'ferry' }), ['nycferry', 'siferry']);
});

test('byte-order marks are stripped from the first column', () => {
  const { routesById, stopsById } = loadAgencyStaticData('siferry');
  assert.deepEqual(routesById.get('SIF'), { routeId: 'SIF', shortName: 'Staten Island Ferry', name: 'Staten Island Ferry', color: 'FF8330' });
  assert.equal(stopsById.get('stgeorge').name, 'St. George Ferry Terminal');
});

test('the ferry is nearby at St. George, each way leaving from the terminal it departs', async () => {
  assert.ok(availableAgencyIds().includes('siferry'));
  const ferry = (await findNearbyTransit(ST_GEORGE.lat, ST_GEORGE.lng)).find((route) => route.agencyId === 'siferry');
  assert.ok(ferry, 'the Staten Island Ferry is listed');
  assert.equal(ferry.routeId, 'SIF');
  assert.equal(ferry.agencyDisplayName, 'Staten Island Ferry');
  assert.equal(ferry.color, '#FF8330');
  assert.ok(ferry.distanceMeters < 300);
  // Toward Manhattan from here; toward St. George only from Whitehall, never as arrivals here.
  assert.deepEqual(
    { stopId: ferry.direction0.stopId, headsign: ferry.direction0.headsign },
    { stopId: 'stgeorge', headsign: 'Whitehall Ferry Terminal' },
  );
  assert.deepEqual(
    { stopId: ferry.direction1.stopId, headsign: ferry.direction1.headsign },
    { stopId: 'whitehall', headsign: 'St. George Ferry Terminal' },
  );
});

test('the ferry is nearby at Whitehall too', async () => {
  const ferry = (await findNearbyTransit(WHITEHALL.lat, WHITEHALL.lng)).find((route) => route.agencyId === 'siferry');
  assert.ok(ferry, 'the Staten Island Ferry is listed');
  assert.ok(ferry.distanceMeters < 300);
  assert.equal(ferry.direction1.stopId, 'whitehall');
});

test('live status asks no feed, and departures come from the timetable', async () => {
  const status = await getRouteStatus('siferry', 'SIF');
  assert.deepEqual(fetched, []);
  assert.deepEqual(status.trips, []);
  assert.deepEqual(status.vehicles, []);

  const predictions = await getStopPredictions('siferry', 'SIF', 'whitehall', 'stgeorge', status.trips);
  assert.ok(predictions.towardDirection0.length > 0, 'scheduled departures from St. George');
  assert.ok(predictions.towardDirection1.length > 0, 'scheduled departures from Whitehall');
  assert.ok([...predictions.towardDirection0, ...predictions.towardDirection1].every((prediction) => !prediction.live));
});

test('a boat arriving at a terminal is not listed as a departure from it', async () => {
  // Both directions asked at St. George: only boats leaving it count.
  const predictions = await getStopPredictions('siferry', 'SIF', 'stgeorge', 'stgeorge', []);
  assert.ok(predictions.towardDirection0.length > 0);
  assert.deepEqual(predictions.towardDirection1, []);
});

test('route geometry runs between the two terminals each way', async () => {
  const toManhattan = await getRouteGeometry('siferry', 'SIF', 0);
  const toStatenIsland = await getRouteGeometry('siferry', 'SIF', 1);
  assert.equal(toManhattan.headsign, 'Whitehall Ferry Terminal');
  assert.deepEqual(toManhattan.stops.map((stop) => stop.name), ['St. George Ferry Terminal', 'Whitehall Ferry Terminal']);
  assert.deepEqual(toStatenIsland.stops.map((stop) => stop.name), ['Whitehall Ferry Terminal', 'St. George Ferry Terminal']);
});
