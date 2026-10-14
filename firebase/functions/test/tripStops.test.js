const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { normalizeRoutesResponse } = require('../lib/tripPlanning');
const { addTripStops, matchTripStops, pickTrip, serviceDaysFor } = require('../lib/tripStops');

// The recorded trips run on Wednesday, October 14, 2026, which the checked-in timetables cover.
const fixture = (name) => normalizeRoutesResponse(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')), '2026-10-14T12:30:00Z', 'Penn Station');
const transitSteps = (itineraries) => itineraries.flatMap((itinerary) => itinerary.steps.filter((step) => step.kind === 'transit'));
const lirrSteps = transitSteps(fixture('routes-sbu-penn.json')).filter((step) => step.agency.name === 'Long Island Rail Road');
const shifted = (step, minutes) => ({ ...step, from: { ...step.from, time: new Date(Date.parse(step.from.time) + minutes * 60_000).toISOString() } });

test('LIRR legs get their stops in between, in time order, between boarding and alighting', async () => {
  assert.ok(lirrSteps.length >= 4);
  for (const step of lirrSteps) {
    const result = await matchTripStops(step);
    assert.ok(result, `${step.from.name} → ${step.to.name} should match`);
    assert.ok(Math.abs(result.stops.length - (step.stopCount - 1)) <= 1);
    let previous = Date.parse(step.from.time);
    for (const stop of result.stops) {
      const at = Date.parse(stop.time);
      assert.ok(at >= previous, `${stop.name} is in time order`);
      assert.ok(at <= Date.parse(step.to.time));
      previous = at;
    }
  }
});

test('names the Port Jefferson Branch stops between Stony Brook and Hicksville', async () => {
  const step = lirrSteps.find((candidate) => candidate.from.name === 'Stony Brook' && candidate.to.name === 'Hicksville');
  const result = await matchTripStops(step);
  assert.deepEqual(result.stops.slice(0, 3).map((stop) => stop.name), ['St. James', 'Smithtown', 'Kings Park']);
  assert.ok(result.tripId);
});

test('a bus leg starts after its boarding stop, even when a neighbor shares the minute', async () => {
  const bus = transitSteps(fixture('routes-sbu-mall.json')).find((step) => step.line.shortName === '51');
  const result = await matchTripStops(bus);
  assert.equal(result.stops.length, bus.stopCount - 1);
  assert.notEqual(result.stops[0].name, bus.from.name);
});

test('an agency without a Pathly timetable gets no stops', async () => {
  const step = { ...lirrSteps[0], agency: { name: 'MTA Bus Company' }, mode: 'bus' };
  assert.equal(await matchTripStops(step), undefined);
});

test('a departure 10 minutes off every scheduled trip gets no stops', async () => {
  assert.equal(await matchTripStops(shifted(lirrSteps[0], 10)), undefined);
});

test('two trips about equally close to the departure are ambiguous and get no stops', () => {
  const candidate = (tripId, offsetSeconds, stops = 5) => ({ agencyId: 'lirr', tripId, between: Array.from({ length: stops }), offsetSeconds, score: offsetSeconds, startMs: 0 });
  assert.equal(pickTrip([candidate('a', 0), candidate('b', 45)], 6), undefined);
  assert.equal(pickTrip([candidate('a', 0), candidate('b', 90)], 6).tripId, 'a');
  // The same trip through two platforms isn't a rival.
  assert.equal(pickTrip([candidate('a', 30), candidate('a', 0)], 6).tripId, 'a');
  // A stop count far from Google's means a different stopping pattern.
  assert.equal(pickTrip([candidate('a', 0, 2)], 6), undefined);
});

test('a departure after midnight is also matched against the previous service day', () => {
  // 12:30 AM EDT on Thursday, October 15, 2026.
  const [today, yesterday] = serviceDaysFor(Date.parse('2026-10-15T04:30:00Z'));
  assert.deepEqual([today.dateKey, today.seconds], ['20261015', 30 * 60]);
  // GTFS writes Wednesday's late trains as 24:30:00.
  assert.deepEqual([yesterday.dateKey, yesterday.dayOfWeek, yesterday.seconds], ['20261014', 3, 24 * 3600 + 30 * 60]);
});

test('service days follow GTFS noon-minus-12h across the fall-back DST change', () => {
  // 1:30 AM EST on Sunday, November 1, 2026, after clocks fell back. Saturday's GTFS "midnight"
  // is its noon minus 12 h (12:00 AM EDT), 26.5 real hours earlier, so this is Saturday's 26:30:00.
  const [, saturday] = serviceDaysFor(Date.parse('2026-11-01T06:30:00Z'));
  assert.equal(saturday.dateKey, '20261031');
  assert.equal(saturday.seconds, 26 * 3600 + 30 * 60);
});

test('adds stops within the budget and gives up on slow matches', async () => {
  const itineraries = fixture('routes-sbu-penn.json');
  const slow = () => new Promise((resolve) => setTimeout(() => resolve({ stops: [], tripId: 'late' }), 500));
  const started = Date.now();
  await addTripStops(itineraries, 50, slow);
  assert.ok(Date.now() - started < 400);
  assert.ok(transitSteps(itineraries).every((step) => step.stops === undefined));

  const matched = await addTripStops(fixture('routes-sbu-penn.json'), 5_000);
  assert.ok(transitSteps(matched).some((step) => step.stops && step.stops.length > 0));
});
