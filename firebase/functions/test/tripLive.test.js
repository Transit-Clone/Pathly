const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { addConnections, addLiveStatus, alertAffectsLeg, isSameTrip, legLiveFrom } = require('../lib/tripLive');
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
  // The live feed often leaves off the routing at the end of the timetable's id.
  assert.equal(isSameTrip('AFA26GEN-L-2024-S300_096400_L..S16R', '096400_L..S'), true);
  assert.equal(isSameTrip('AFA26GEN-L-2024-S300_096400_L..S16R', '096400_L..N'), false);
  assert.equal(isSameTrip('AFA26GEN-L-2024-S300_096400_L..S16R', '096400_L'), false);
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

test('a matched trip missing from the feed falls back to the live trip leaving nearest the planned time', () => {
  const ref = { ...REF, routeId: '7', tripId: 'not-in-the-feed' };
  const live = legLiveFrom([entity({
    trip: { tripId: 'running', routeId: '7' },
    stopTimeUpdate: [{ stopId: 'board', departure: { time: seconds(2) } }, { stopId: 'alight', arrival: { time: seconds(22) } }],
  })], ref, transit(0, 20));
  assert.equal(live?.status, 'tracked');
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
  const [trip] = await addLiveStatus([{ steps: [soon, later, slow] }], 200, now, lookup, (step) => refs.get(step), async () => []);
  assert.ok(Date.now() - started < 2_000);
  assert.deepEqual(looked, [soon, slow]);
  assert.deepEqual(trip.steps[0].live, { status: 'tracked', departs: at(12) });
  assert.equal(trip.steps[1].live, undefined);
  assert.equal(trip.steps[2].live, undefined);
});

test("every matched leg carries its line's service alerts, looked up once per line", async () => {
  const now = Date.parse(at(0));
  const soon = transit(10, 30);
  const later = transit(180, 200);
  const other = transit(40, 50);
  const unmatched = transit(60, 70);
  const refs = new Map([[soon, REF], [later, { ...REF, tripId: 'later' }], [other, { ...REF, routeId: '2' }]]);
  const asked = [];
  const alert = { id: 'a1', header: 'Delays', description: 'Signal problems', kind: 'delays', label: 'Delays', warning: true, upcoming: false, periods: [], stopIds: [], mtaType: null };
  const alertsFor = async (ref) => {
    asked.push(ref.routeId);
    return ref.routeId === '1' ? [alert] : [];
  };
  const [trip] = await addLiveStatus([{ steps: [soon, later, other, unmatched] }], 200, now, async () => undefined, (step) => refs.get(step), alertsFor);
  assert.deepEqual(asked.sort(), ['1', '2']);
  const legAlert = { id: 'a1', header: 'Delays', description: 'Signal problems', label: 'Delays', warning: true, upcoming: false };
  assert.deepEqual(trip.steps[0].alerts, [legAlert]);
  assert.deepEqual(trip.steps[1].alerts, [legAlert]);
  assert.equal(trip.steps[2].alerts, undefined);
  assert.equal(trip.steps[3].alerts, undefined);
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

test('only alerts that touch the ride itself are kept for it', () => {
  const ride = transit(60, 90);
  const ref = { ...REF, stopIdsBetween: ['mid'] };
  const seconds = (minutes) => Date.parse(at(minutes)) / 1000;
  const alert = (fields) => ({ id: 'a', header: 'h', description: null, kind: 'detour', label: 'Detour in effect', warning: true, upcoming: false, periods: [], stopIds: [], mtaType: null, ...fields });
  assert.equal(alertAffectsLeg(alert({}), ride, ref), true, 'a line-wide disruption');
  assert.equal(alertAffectsLeg(alert({ kind: 'notice' }), ride, ref), false, 'a notice');
  assert.equal(alertAffectsLeg(alert({ kind: 'extra' }), ride, ref), false, 'extra service');
  assert.equal(alertAffectsLeg(alert({ periods: [{ start: seconds(60 * 24 * 3), end: seconds(60 * 24 * 4) }], upcoming: true }), ride, ref), false, 'planned for another day');
  assert.equal(alertAffectsLeg(alert({ periods: [{ start: seconds(0), end: seconds(30) }] }), ride, ref), false, 'over before the ride');
  assert.equal(alertAffectsLeg(alert({ periods: [{ start: seconds(80), end: 0 }], upcoming: true }), ride, ref), true, 'starting during the ride');
  assert.equal(alertAffectsLeg(alert({ stopIds: ['elsewhere'] }), ride, ref), false, 'at a stop the ride skips');
  assert.equal(alertAffectsLeg(alert({ stopIds: ['board'] }), ride, ref), true, 'where the rider boards');
  assert.equal(alertAffectsLeg(alert({ stopIds: ['mid'] }), ride, ref), true, 'a stop on the way');
  assert.equal(alertAffectsLeg(alert({ stopIds: ['A27N'] }), ride, { ...ref, boardStopId: 'A27S' }), true, "a subway platform's station");
});
