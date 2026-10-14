const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { transit_realtime } = require('gtfs-realtime-bindings');

const { findNearbyTransit } = require('../lib/gtfsDiscovery');
const { getStopPredictions } = require('../lib/gtfsSchedule');
const { availableAgencyIds, resetGtfsStaticDataForTests, setAgencyDataForTests } = require('../lib/gtfsStaticData');
const { getRouteStatus } = require('../lib/gtfsStatus');

const fixture = (agency) => path.join(__dirname, 'fixtures', 'gtfs', agency);
const FIRST_AVE_23 = { lat: 40.737, lng: -73.9789 };

/** A GTFS-RT feed with one trip update arriving at `stopId` in `minutes`. */
function feed({ tripId, routeId, stopId, minutes }) {
  const time = Math.floor(Date.now() / 1000) + minutes * 60;
  const message = transit_realtime.FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: Math.floor(Date.now() / 1000) },
    entity: [{ id: tripId, tripUpdate: { trip: { tripId, routeId }, stopTimeUpdate: [{ stopId, arrival: { time } }] } }],
  });
  return Buffer.from(transit_realtime.FeedMessage.encode(message).finish());
}

let originalFetch;
let fetched;
test.beforeEach(() => {
  resetGtfsStaticDataForTests();
  setAgencyDataForTests('mn', fixture('mn'));
  setAgencyDataForTests('nycferry', fixture('nycferry'));
  originalFetch = global.fetch;
  fetched = [];
});
test.afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.MTA_BUS_TIME_API_KEY;
});

test('Manhattan buses show up nearby, the SBS under its full name', async () => {
  const routes = await findNearbyTransit(FIRST_AVE_23.lat, FIRST_AVE_23.lng);
  const buses = routes.filter((route) => route.agencyId === 'mn');
  assert.deepEqual(buses.map((route) => route.shortName).sort(), ['M15', 'M15-SBS']);
  assert.equal(buses[0].agencyDisplayName, 'MTA Bus');
  assert.equal(buses.find((route) => route.shortName === 'M15').color, '#00AEEF');
});

test('an on-demand agency with no data on this instance is left out', async () => {
  assert.ok(availableAgencyIds().includes('mn'));
  assert.equal(availableAgencyIds().includes('bk'), false);
  const routes = await findNearbyTransit(FIRST_AVE_23.lat, FIRST_AVE_23.lng);
  assert.equal(routes.some((route) => route.agencyId === 'bk'), false);
});

test('Bus Time predictions mark a bus as tracked, without the key in any error', async () => {
  process.env.MTA_BUS_TIME_API_KEY = 'test-bustime-key';
  global.fetch = async (url) => {
    fetched.push(String(url));
    if (String(url).includes('tripUpdates')) return new Response(feed({ tripId: 'M15-N-1', routeId: 'M15', stopId: '403', minutes: 5 }));
    return new Response(Buffer.from(transit_realtime.FeedMessage.encode(transit_realtime.FeedMessage.create({ header: { gtfsRealtimeVersion: '2.0' }, entity: [] })).finish()));
  };
  const status = await getRouteStatus('mn', 'M15');
  assert.equal(status.trips.length, 1);
  assert.ok(fetched.every((url) => url.startsWith('https://gtfsrt.prod.obanyc.com/') && url.includes('key=test-bustime-key')));
  const predictions = await getStopPredictions('mn', 'M15', '403', '404', status.trips);
  const live = [...predictions.towardDirection0, ...predictions.towardDirection1].filter((prediction) => prediction.live);
  assert.ok(live.length >= 1, 'the tracked bus is listed live');

  global.fetch = async () => new Response('denied', { status: 401 });
  const { fetchFeedEntities } = require('../lib/gtfsRealtime');
  await assert.rejects(fetchFeedEntities('https://gtfsrt.prod.obanyc.com/tripUpdates?key=secret-value-x'), (error) => !String(error.message).includes('secret-value-x'));
});

test('without the Bus Time key, buses show their timetable untracked and nothing is fetched', async () => {
  global.fetch = async (url) => {
    fetched.push(String(url));
    return new Response('unexpected', { status: 500 });
  };
  const status = await getRouteStatus('mn', 'M15');
  assert.deepEqual(status.trips, []);
  assert.deepEqual(status.vehicles, []);
  assert.deepEqual(fetched, []);
  const predictions = await getStopPredictions('mn', 'M15', '403', '404', status.trips);
  assert.ok([...predictions.towardDirection0, ...predictions.towardDirection1].every((prediction) => !prediction.live));
});

test('a ferry trip update without a route_id still counts for its route, with no vehicles', async () => {
  global.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(feed({ tripId: '762', routeId: '', stopId: '20', minutes: 12 }));
  };
  const status = await getRouteStatus('nycferry', 'ER');
  assert.deepEqual(fetched, ['https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate']);
  assert.equal(status.trips.length, 1);
  assert.equal(status.trips[0].tripId, '762');
  assert.deepEqual(status.vehicles, []);
});
