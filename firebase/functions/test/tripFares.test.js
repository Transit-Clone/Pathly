const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createFareEstimator, isLirrPeak, lirrFareCents } = require('../lib/tripFares');
const { loadAgencyStaticData } = require('../lib/gtfsStaticData');
const { normalizeRoutesResponse } = require('../lib/tripPlanning');

const lirrStops = loadAgencyStaticData('lirr').stopsById;
const estimate = createFareEstimator(lirrStops.values());
const station = (name) => {
  const stop = [...lirrStops.values()].find((candidate) => candidate.name === name);
  assert.ok(stop, `LIRR station ${name}`);
  return { lat: stop.lat, lng: stop.lon };
};
const SOMEWHERE = { lat: 40.86, lng: -73.2 };

/** A transit leg as planTrip's normalizer produces it (only what fares read). */
function leg(agency, { from = SOMEWHERE, to = SOMEWHERE, at, mode = 'bus', shortName = '1' }) {
  return { kind: 'transit', mode, agency: { name: agency }, line: { name: shortName, shortName }, from: { name: 'A', location: from, time: at }, to: { name: 'B', location: to, time: at }, stopCount: 1, durationSeconds: 600, path: [] };
}
const LIRR = 'Long Island Rail Road';
const SUFFOLK = 'Suffolk County Transit';
// Wednesday Oct 14, 2026 (EDT): 8:00 AM is peak, 11:00 AM off-peak.
const PEAK = '2026-10-14T12:00:00Z';
const OFF_PEAK = '2026-10-14T15:00:00Z';
const later = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

test('Stony Brook to Penn Station costs the chart\'s Zone 10 to Zone 1 fare', () => {
  const trip = (at) => [leg(LIRR, { from: station('Stony Brook'), to: station('Penn Station'), at, mode: 'rail' })];
  assert.deepEqual(estimate(trip(PEAK)), { text: '$21.50', cents: 2150, currency: 'USD', estimated: true });
  assert.equal(estimate(trip(OFF_PEAK)).cents, 1600);
});

test('a change of trains is one station-to-station ticket', () => {
  const steps = [
    leg(LIRR, { from: station('Stony Brook'), to: station('Hicksville'), at: OFF_PEAK, mode: 'rail' }),
    leg(LIRR, { from: station('Hicksville'), to: station('Penn Station'), at: later(OFF_PEAK, 60), mode: 'rail' }),
  ];
  assert.equal(estimate(steps).cents, 1600);
});

test('Suffolk bus 51 to the LIRR from Ronkonkoma adds the bus fare to the rail fare', () => {
  const steps = [
    leg(SUFFOLK, { at: OFF_PEAK, shortName: '51' }),
    leg(LIRR, { from: station('Ronkonkoma'), to: station('Penn Station'), at: later(OFF_PEAK, 50), mode: 'rail' }),
  ];
  assert.equal(estimate(steps).cents, 225 + 1600);
});

test('Suffolk transfers: one $0.25 ticket covers two more buses within two hours', () => {
  assert.equal(estimate([leg(SUFFOLK, { at: OFF_PEAK }), leg('Suffolk County Transit - West', { at: later(OFF_PEAK, 40) })]).cents, 250);
  const three = [leg(SUFFOLK, { at: OFF_PEAK }), leg(SUFFOLK, { at: later(OFF_PEAK, 40) }), leg(SUFFOLK, { at: later(OFF_PEAK, 80) })];
  assert.equal(estimate(three).cents, 250);
  assert.equal(estimate([leg(SUFFOLK, { at: OFF_PEAK }), leg(SUFFOLK, { at: later(OFF_PEAK, 150) })]).cents, 450, 'the transfer expired');
});

test('subway plus local bus is one $3.00 fare; express buses cost $7.25', () => {
  const subwayBus = [leg('MTA New York City Transit', { at: OFF_PEAK, mode: 'subway', shortName: 'E' }), leg('MTA', { at: later(OFF_PEAK, 30), shortName: 'Bx21' })];
  assert.equal(estimate(subwayBus).cents, 300);
  assert.equal(estimate([leg('Mta Bus Company', { at: OFF_PEAK, shortName: 'BxM10' })]).cents, 725);
  assert.equal(estimate([leg('Nassau Inter-County Express', { at: OFF_PEAK, shortName: 'n40' }), leg('MTA New York City Transit', { at: later(OFF_PEAK, 20), mode: 'subway' })]).cents, 300);
});

test('an unknown agency or an unmatched LIRR stop leaves the fare unknown', () => {
  assert.equal(estimate([leg('Hampton Jitney', { at: OFF_PEAK })]), undefined);
  assert.equal(estimate([leg(LIRR, { from: { lat: 40.5, lng: -73 }, to: station('Penn Station'), at: OFF_PEAK, mode: 'rail' })]), undefined);
});

test('peak follows New York weekday rush hours', () => {
  assert.equal(isLirrPeak(PEAK), true);
  assert.equal(isLirrPeak(OFF_PEAK), false);
  assert.equal(isLirrPeak('2026-10-14T21:00:00Z'), true, '5 PM');
  assert.equal(isLirrPeak('2026-10-17T12:00:00Z'), false, 'Saturday');
});

test('the fare chart is symmetric, and peak equals off-peak within Zones 4 to 14', () => {
  const zones = [1, 3, 4, 7, 9, 10, 12, 14];
  for (const a of zones) {
    for (const b of zones) {
      for (const peak of [true, false]) assert.equal(lirrFareCents(a, b, peak), lirrFareCents(b, a, peak));
      if (a >= 4 && b >= 4) assert.equal(lirrFareCents(a, b, true), lirrFareCents(a, b, false));
      assert.ok(lirrFareCents(a, b, true) >= lirrFareCents(a, b, false));
    }
  }
});

test('every LIRR passenger station has a fare zone', () => {
  const unmatched = [...lirrStops.values()].filter((stop) => estimate([leg(LIRR, { from: { lat: stop.lat, lng: stop.lon }, to: station('Penn Station'), at: OFF_PEAK, mode: 'rail' })]) === undefined);
  assert.deepEqual(unmatched.map((stop) => stop.name), ['Hillside Facility'], 'only the employee-only facility has no fare');
});

test('every recorded itinerary gets a fare', () => {
  for (const name of ['routes-sbu-penn.json', 'routes-sbu-mall.json']) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
    const itineraries = normalizeRoutesResponse(raw, '2026-10-14T12:30:00Z', 'Destination', estimate);
    assert.ok(itineraries.every((itinerary) => itinerary.fare?.estimated === true), name);
  }
});

test('MTA buses: SBS is a local fare, SIM express buses cost $7.25', () => {
  assert.equal(estimate([leg('MTA New York City Transit', { at: OFF_PEAK, shortName: 'M15-SBS' })]).cents, 300);
  assert.equal(estimate([leg('MTA Bus Company', { at: OFF_PEAK, shortName: 'SIM3C' })]).cents, 725);
  // A subway ride then a local bus within two hours is one fare.
  assert.equal(estimate([leg('MTA New York City Transit', { at: OFF_PEAK, mode: 'subway', shortName: '4' }), leg('MTA New York City Transit', { at: later(OFF_PEAK, 40), shortName: 'Bx12' })]).cents, 300);
});

test('NYC Ferry costs $4.50, then $5.00 from October 19, 2026, with no transfers', () => {
  const ferry = (at) => leg('NYC Ferry', { at, mode: 'ferry', shortName: 'ER' });
  assert.equal(estimate([ferry('2026-10-18T15:00:00Z')]).cents, 450);
  assert.equal(estimate([ferry('2026-10-19T15:00:00Z')]).cents, 500);
  // The ferry doesn't take or give an OMNY transfer: subway + ferry is both fares.
  assert.equal(estimate([leg('MTA New York City Transit', { at: '2026-10-19T15:00:00Z', mode: 'subway', shortName: 'F' }), ferry(later('2026-10-19T15:00:00Z', 20))]).cents, 800);
});
