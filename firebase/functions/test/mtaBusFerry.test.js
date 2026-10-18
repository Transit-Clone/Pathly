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

test('all-caps bus stop names and headsigns are recased for riders', () => {
  const { displayTransitName } = require('../lib/transitNames');
  assert.equal(displayTransitName('1 AV/E 23 ST'), '1 Av/E 23 St');
  assert.equal(displayTransitName('HARLEM 126 ST'), 'Harlem 126 St');
  assert.equal(displayTransitName('SBS SOUTH FERRY via 2 AV'), 'SBS South Ferry via 2 Av');
  assert.equal(displayTransitName('SELECT BUS SERVICE 125 ST via 1 AV'), 'Select Bus Service 125 St via 1 Av');
  assert.equal(displayTransitName('ST GEORGE via VICTORY BLVD'), 'St George via Victory Blvd');
  assert.equal(displayTransitName('COLLEGE OF STATEN ISLAND'), 'College of Staten Island');
  assert.equal(displayTransitName('W 23RD ST/MCDONALD AV'), 'W 23rd St/McDonald Av');
  assert.equal(displayTransitName("JFK AIRPORT O'BRIEN PL"), "JFK Airport O'Brien Pl");
  assert.equal(displayTransitName('Penn Station'), 'Penn Station');
});

test('bus stop names reach riders recased', async () => {
  const routes = await findNearbyTransit(FIRST_AVE_23.lat, FIRST_AVE_23.lng);
  const m15 = routes.find((route) => route.agencyId === 'mn' && route.shortName === 'M15');
  assert.ok(JSON.stringify(m15).includes('1 Av/E 23 St') || JSON.stringify(m15).includes('Harlem 126 St'), JSON.stringify(m15));
  assert.equal(/HARLEM|1 AV\//.test(JSON.stringify(m15)), false);
});
