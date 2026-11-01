const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { withReports } = require('../lib/rideReports');
const { maxRiderGapMeters, riderGapAllowed, withRiders } = require('../lib/rideSessions');
const { holidayService, winterAlerts } = require('../lib/serviceOutlook');
const { createFareEstimator, lirrReducedFareCents } = require('../lib/tripFares');
const { loadAgencyStaticData } = require('../lib/gtfsStaticData');

const NOW = 1_800_000_000_000;
const vehicle = (tripId = 'trip', lat = 40.7) => ({ tripId, directionId: 0, lat, lon: -73.9, currentStatus: null, stopId: null, timestamp: NOW / 1000 - 10 });
const session = (uid, lat, extra = {}) => ({ uid, tripId: 'trip', lat, lon: -73.9, avatar: { id: uid }, reportedAtMs: NOW - 5000, expiresAtMs: NOW + 60_000, ...extra });

test('allows for how far a vehicle may have gone since the feed measured it', () => {
  assert.equal(maxRiderGapMeters(0), 200);
  assert.equal(maxRiderGapMeters(10), 500);
  assert.equal(maxRiderGapMeters(600), 2000);
  assert.equal(riderGapAllowed(vehicle(), { lat: 40.701, lon: -73.9 }, NOW), true);
  assert.equal(riderGapAllowed(vehicle(), { lat: 40.8, lon: -73.9 }, NOW), false);
});

test('a vehicle with no riders is unchanged', () => {
  const plain = vehicle();
  assert.deepEqual(withRiders([plain], [], 'me', NOW), [plain]);
});

test('riders move the vehicle by their median, and the feed position is kept', () => {
  const [result] = withRiders([vehicle()], [session('a', 40.7), session('b', 40.701), session('c', 40.702)], 'b', NOW);
  assert.equal(result.lat, 40.701);
  assert.equal(result.riders.count, 3);
  assert.equal(result.riders.you, true);
  assert.deepEqual(result.riders.avatars[0], { id: 'b' });
  assert.equal(result.riders.feed.lat, 40.7);
  assert.equal(result.timestamp, (NOW - 5000) / 1000);
});

test('never sends more than three avatars, or any uid', () => {
  const [result] = withRiders([vehicle()], ['a', 'b', 'c', 'd'].map((uid) => session(uid, 40.7)), undefined, NOW);
  assert.equal(result.riders.count, 4);
  assert.equal(result.riders.avatars.length, 3);
  assert.equal(result.riders.you, false);
  assert.equal(Object.keys(result.riders).includes('uids'), false);
});

test('leaves out expired sessions, far-off riders, and other trips', () => {
  const [result] = withRiders([vehicle()], [
    session('expired', 40.7, { expiresAtMs: NOW - 1 }),
    session('far', 41.5),
    session('other', 40.7, { tripId: 'other' }),
  ], 'me', NOW);
  assert.equal(result.riders, undefined);
  assert.equal(result.lat, 40.7);
});

test('keeps only winter events from the weather service, once each', () => {
  const feature = (id, event) => ({ id, properties: { event, headline: `${event} headline`, onset: null } });
  const alerts = winterAlerts([{ features: [feature('1', 'Winter Storm Watch'), feature('2', 'Flood Warning')] }, { features: [feature('1', 'Winter Storm Watch'), feature('3', 'Blizzard Warning')] }]);
  assert.deepEqual(alerts.map((alert) => alert.id), ['1', '3']);
});

test('reduced fares follow the published rules', () => {
  const lirrStops = loadAgencyStaticData('lirr').stopsById;
  const estimate = createFareEstimator(lirrStops.values());
  const at = '2026-10-14T12:00:00Z';
  const SOMEWHERE = { lat: 40.86, lng: -73.2 };
  const leg = (agency, shortName = '1') => ({ kind: 'transit', mode: 'bus', agency: { name: agency }, line: { name: shortName, shortName }, from: { name: 'A', location: SOMEWHERE, time: at }, to: { name: 'B', location: SOMEWHERE, time: at }, stopCount: 1, durationSeconds: 600, path: [] });
  const reduced = (steps) => estimate(steps, at, 'reduced')?.cents;
  assert.equal(lirrReducedFareCents(1, 10), 1075);
  assert.equal(lirrReducedFareCents(14, 1), 1650);
  assert.equal(reduced([leg('MTA New York City Transit')]), 150);
  assert.equal(reduced([leg('Suffolk County Transit')]), 75);
  assert.equal(reduced([leg('NYC Ferry')]), 150);
  // Sources disagree on the express bus's reduced fare, so there's no estimate.
  assert.equal(reduced([leg('MTA New York City Transit', 'X27')]), undefined);
  assert.equal(estimate([leg('MTA New York City Transit', 'X27')], at)?.cents, 725);
});

test('reads a holiday from the agency timetable', () => {
  const { setAgencyDataForTests } = require('../lib/gtfsStaticData');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holiday-'));
  const write = (name, rows) => fs.writeFileSync(path.join(dir, name), `${rows.join('\n')}\n`);
  write('routes.txt', ['route_id,route_short_name,route_long_name,route_color', 'A,A,A,000000', 'B,B,B,000000', 'C,C,C,000000']);
  write('stops.txt', ['stop_id,stop_name,stop_lat,stop_lon']);
  write('calendar.txt', ['service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date', 'WK,1,1,1,1,1,0,0,20260101,20261231', 'HOL,0,0,0,0,0,0,0,20260101,20261231']);
  write('calendar_dates.txt', ['service_id,date,exception_type', 'WK,20261126,2', 'HOL,20261126,1']);
  const trips = (route, service, count) => Array.from({ length: count }, (_, i) => `${route},${service},${route}-${service}-${i},,0,`);
  write('trips.txt', ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id', ...trips('A', 'WK', 10), ...trips('A', 'HOL', 6), ...trips('B', 'WK', 4), ...trips('C', 'WK', 4), ...trips('C', 'HOL', 4)]);
  setAgencyDataForTests('nice', dir);
  assert.deepEqual(holidayService('nice', 'A', '20261126'), { status: 'reduced', percentFewer: 40 });
  assert.deepEqual(holidayService('nice', 'B', '20261126'), { status: 'none' });
  assert.deepEqual(holidayService('nice', 'C', '20261126'), { status: 'regular' });
  // No published change that day, so matching the usual week proves nothing; past the timetable, nothing's known.
  assert.deepEqual(holidayService('nice', 'C', '20261112'), { status: 'unknown' });
  assert.deepEqual(holidayService('nice', 'A', '20270701'), { status: 'unknown' });
});

test('withReports counts each kind per vehicle, drops expired ones, and never exposes who reported', () => {
  const now = 1_000_000;
  const reports = [
    { tripId: 'a', kind: 'packed', expiresAtMs: now + 1000, uid: 'secret' },
    { tripId: 'a', kind: 'packed', expiresAtMs: now + 1000 },
    { tripId: 'a', kind: 'stuck', expiresAtMs: now + 1000 },
    { tripId: 'a', kind: 'dirty', expiresAtMs: now - 1 },
    { tripId: 'b', kind: 'seats', expiresAtMs: now - 1 },
  ];
  const [a, b] = withReports([{ tripId: 'a' }, { tripId: 'b' }], reports, now);
  assert.deepEqual(a.reports, [{ kind: 'packed', count: 2 }, { kind: 'stuck', count: 1 }]);
  assert.equal(b.reports, undefined);
  assert.equal(JSON.stringify(a).includes('secret'), false);
});
