const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { addConnections, addLiveStatus, isSameTrip, legLiveFrom } = require('../lib/tripLive');
const { normalizeRoutesResponse } = require('../lib/tripPlanning');
const { matchTripStops } = require('../lib/tripStops');

const at = (minutes) => new Date(Date.UTC(2026, 9, 26, 16, 0) + minutes * 60_000).toISOString();
const seconds = (minutes) => Math.round(Date.parse(at(minutes)) / 1000);
const transit = (fromMinutes, toMinutes, extra = {}) => ({
  kind: 'transit',
  from: { name: 'A', location: { lat: 0, lng: 0 }, time: at(fromMinutes) },
  to: { name: 'B', location: { lat: 0, lng: 0 }, time: at(toMinutes) },
  ...extra,
});
const walk = (minutes) => ({ kind: 'walk', durationSeconds: minutes * 60, distanceMeters: 0, toName: 'B', path: [] });
const REF = { agencyId: 'lirr', routeId: '1', tripId: 'GO202_26_2', boardStopId: 'board', alightStopId: 'alight' };
const entity = (tripUpdate) => ({ id: 'e', tripUpdate });

test('a live trip_id names its timetable trip, including the subway feed\'s shortened ids', () => {
  assert.equal(isSameTrip('GO202_26_2', 'GO202_26_2'), true);
  assert.equal(isSameTrip('ASP26GEN-1038-Sunday-00_000600_1..S03R', '000600_1..S03R'), true);
  assert.equal(isSameTrip('ASP26GEN-1038-Sunday-00_000600_1..S03R', '0600_1..S03R'), false);
  assert.equal(isSameTrip('GO202_26_2', ''), false);
});

test('a leg takes its live departure and arrival from its own trip\'s stops', () => {
  const live = legLiveFrom([
    entity({ trip: { tripId: 'other' }, stopTimeUpdate: [{ stopId: 'board', departure: { time: seconds(0) } }] }),
    entity({ trip: { tripId: 'GO202_26_2' }, stopTimeUpdate: [{ stopId: 'board', departure: { time: seconds(4) } }, { stopId: 'alight', arrival: { time: seconds(34) } }] }),
  ], REF, transit(0, 30));
  assert.deepEqual(live, { status: 'tracked', departs: at(4), arrives: at(34), delaySeconds: 240 });
});

test('a delay alone moves the planned time, and another platform of the same station counts', () => {
  const live = legLiveFrom(
    [entity({ trip: { tripId: 'GO202_26_2' }, stopTimeUpdate: [{ stopId: 'board-2', departure: { delay: -60 } }] })],
    REF,
    transit(0, 30),
    { stationOf: (stopId) => stopId.replace(/-\d$/, '') },
  );
  assert.deepEqual(live, { status: 'tracked', departs: at(-1), delaySeconds: -60 });
});

test('a cancelled trip or a skipped stop says so; a trip the feed doesn\'t carry says nothing', () => {
  assert.deepEqual(legLiveFrom([entity({ trip: { tripId: 'GO202_26_2', scheduleRelationship: 3 } })], REF, transit(0, 30)), { status: 'cancelled' });
  assert.deepEqual(
    legLiveFrom([entity({ trip: { tripId: 'GO202_26_2' }, stopTimeUpdate: [{ stopId: 'alight', scheduleRelationship: 1 }] })], REF, transit(0, 30)),
    { status: 'skips-stop' },
  );
  assert.equal(legLiveFrom([entity({ trip: { tripId: 'other' } })], REF, transit(0, 30)), undefined);
  assert.equal(legLiveFrom([entity({ trip: { tripId: 'GO202_26_2' }, stopTimeUpdate: [{ stopId: 'elsewhere', departure: { time: seconds(1) } }] })], REF, transit(0, 30)), undefined);
});

test("without a trip id, the line's live trip leaving nearest the planned time is the leg's", () => {
  const ref = { agencyId: 'suffolk', routeId: '62', boardStopId: 'board', alightStopId: 'alight' };
  const trip = (tripId, routeId, boardMinutes, stops = ['board', 'alight']) => entity({
    trip: { tripId, routeId },
    stopTimeUpdate: stops.map((stopId, index) => ({ stopId, departure: { time: seconds(boardMinutes + index * 20) } })),
  });
  const entities = [
    trip('far', '62', 30),
    trip('other-line', '51', 1),
    trip('wrong-way', '62', 1, ['alight', 'board']),
    trip('near', '62', 3),
    trip('next', '62', 9),
  ];
  assert.deepEqual(legLiveFrom(entities, ref, transit(0, 20)), { status: 'tracked', departs: at(3), arrives: at(23), delaySeconds: 180 });
  // Nothing within a few minutes of the plan: no guess.
  assert.equal(legLiveFrom([trip('far', '62', 30)], ref, transit(0, 20)), undefined);
  // A live update that leaves route_id out is placed by the timetable.
  assert.equal(legLiveFrom([entity({ trip: { tripId: 't' }, stopTimeUpdate: [{ stopId: 'board', departure: { time: seconds(1) } }, { stopId: 'alight', arrival: { time: seconds(21) } }] })], ref, transit(0, 20), { routeOf: () => '62' }).departs, at(1));
});

test('connections are judged after the walk between legs, with live times where known', () => {
  // 5 minutes between legs, a 4-minute walk: 1 minute spare is tight.
  const tight = [transit(0, 20), walk(4), transit(25, 40)];
  addConnections(tight);
  assert.deepEqual(tight[2].connection, { status: 'tight', spareSeconds: 60 });

  // The first leg running 3 minutes late now misses the second.
  const missed = [transit(0, 20, { live: { status: 'tracked', arrives: at(23) } }), walk(4), transit(25, 40)];
  addConnections(missed);
  assert.deepEqual(missed[2].connection, { status: 'missed', spareSeconds: -120 });

  // Plenty of time: no connection note.
  const easy = [transit(0, 20), walk(2), transit(30, 40)];
  addConnections(easy);
  assert.equal(easy[2].connection, undefined);

  // A cancelled leg is the problem itself, not its connection.
  const cancelled = [transit(0, 20), transit(20, 40, { live: { status: 'cancelled' } })];
  addConnections(cancelled);
  assert.equal(cancelled[1].connection, undefined);
});

test('only legs leaving soon are looked up, and a slow feed doesn\'t hold up the trip', async () => {
  const now = Date.parse(at(0));
  const soon = transit(10, 30);
  const later = transit(180, 200);
  const slow = transit(15, 35);
  const refs = new Map([[soon, REF], [later, REF], [slow, { ...REF, tripId: 'slow' }]]);
  const looked = [];
  const lookup = (ref, step) => {
    looked.push(step);
    return ref.tripId === 'slow' ? new Promise(() => undefined) : Promise.resolve({ status: 'tracked', departs: at(12) });
  };
  const started = Date.now();
  const [trip] = await addLiveStatus([{ steps: [soon, later, slow] }], 200, now, lookup, (step) => refs.get(step));
  assert.ok(Date.now() - started < 2_000);
  assert.deepEqual(looked, [soon, slow]);
  assert.deepEqual(trip.steps[0].live, { status: 'tracked', departs: at(12) });
  assert.equal(trip.steps[1].live, undefined);
  assert.equal(trip.steps[2].live, undefined);
});

test('an exactly matched LIRR leg carries where to find its trip in the live feed', async () => {
  const response = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'routes-sbu-penn.json'), 'utf8'));
  const steps = normalizeRoutesResponse(response, '2026-10-14T12:30:00Z', 'Penn Station')
    .flatMap((itinerary) => itinerary.steps)
    .filter((step) => step.kind === 'transit' && step.agency.name === 'Long Island Rail Road');
  const result = await matchTripStops(steps[0]);
  assert.ok(result?.tripId);
  assert.equal(result.live.agencyId, 'lirr');
  assert.equal(result.live.tripId, result.tripId);
  assert.ok(result.live.routeId && result.live.boardStopId && result.live.alightStopId);
});
