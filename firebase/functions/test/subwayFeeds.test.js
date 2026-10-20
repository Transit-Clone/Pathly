const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const { getStopPredictions } = require('../lib/gtfsSchedule');
const { resetGtfsStaticDataForTests } = require('../lib/gtfsStaticData');
const { getRouteStatus } = require('../lib/gtfsStatus');

const FEED_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F';

function subwayRouteIds() {
  const [header, ...rows] = fs.readFileSync(path.join(__dirname, '..', 'static_data', 'subway', 'routes.txt'), 'utf-8').trim().split(/\r?\n/);
  const index = header.split(',').indexOf('route_id');
  return rows.map((row) => row.split(',')[index]);
}

const feedFor = (routeId) => AGENCY_CONFIGS.subway.feedRequestsForRoute(routeId).map((request) => request.url.slice(FEED_BASE.length));

test('every subway route has a live feed', () => {
  const routeIds = subwayRouteIds();
  assert.ok(routeIds.length > 25);
  for (const routeId of routeIds) assert.equal(feedFor(routeId).length, 1, `route ${routeId}`);
});

test('the Staten Island Railway and the shuttles read the feeds that carry them', () => {
  assert.deepEqual(feedFor('SI'), ['gtfs-si']);
  assert.deepEqual(feedFor('GS'), ['gtfs']);
  assert.deepEqual(feedFor('FS'), ['gtfs-bdfm']);
  assert.deepEqual(feedFor('H'), ['gtfs-ace']);
  assert.deepEqual(feedFor('W'), ['gtfs-nqrw']);
  assert.deepEqual(feedFor('Z'), ['gtfs-jz']);
  assert.deepEqual(feedFor('7X'), ['gtfs']);
});

test('a route with no known feed shows its timetable instead of failing', async () => {
  resetGtfsStaticDataForTests();
  const config = AGENCY_CONFIGS.subway;
  const original = config.feedRequestsForRoute;
  const originalFetch = global.fetch;
  const fetched = [];
  config.feedRequestsForRoute = (routeId) => {
    throw new Error(`No known GTFS-RT feed for subway route_id "${routeId}"`);
  };
  global.fetch = async (url) => {
    fetched.push(String(url));
    return new Response('unexpected', { status: 500 });
  };
  try {
    const status = await getRouteStatus('subway', 'SI');
    assert.deepEqual(status.trips, []);
    assert.deepEqual(status.vehicles, []);
    assert.deepEqual(fetched, []);
    // St George: northbound trains end here, southbound ones leave for Tottenville.
    const predictions = await getStopPredictions('subway', 'SI', 'S31N', 'S31S', status.trips);
    assert.ok(predictions.towardDirection0.length > 0, 'scheduled departures from St George');
    assert.ok(predictions.towardDirection0.every((prediction) => !prediction.live));
  } finally {
    config.feedRequestsForRoute = original;
    global.fetch = originalFetch;
  }
});
