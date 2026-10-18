const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildRoutesRequest, decodePolyline, modeForVehicle, normalizeRoutesResponse } = require('../lib/tripPlanning');

// Real Routes API responses (Stony Brook University, Wednesday 8:30 AM), recorded with the
// app's field mask; see openspec real-trip-planning task 1.1.
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const REQUEST_TIME = '2026-10-14T12:30:00Z';
const transitDetailsOf = (route) => route.legs[0].steps.filter((step) => step.transitDetails).map((step) => step.transitDetails);

const baseRequest = {
  origin: { lat: 40.9126, lng: -73.1234, label: 'Current location' },
  destination: { placeId: 'ChIJ-penn', label: 'Penn Station' },
  time: { mode: 'now' },
  preference: 'fastest',
  modes: ['subway', 'bus', 'rail'],
};

for (const name of ['routes-sbu-penn.json', 'routes-sbu-mall.json']) {
  test(`${name}: every itinerary matches Google's own stops, times, and lines`, () => {
    const raw = fixture(name);
    const itineraries = normalizeRoutesResponse(raw, REQUEST_TIME, 'Destination');
    assert.ok(itineraries.length >= 2, 'several itineraries');

    const byKey = new Map(raw.routes.map((route) => [transitDetailsOf(route).map((d) => `${d.transitLine.name}|${d.stopDetails.departureTime}`).join('>'), route]));
    for (const itinerary of itineraries) {
      const transits = itinerary.steps.filter((step) => step.kind === 'transit');
      const route = byKey.get(transits.map((step) => `${step.line.name}|${step.from.time}`).join('>'));
      assert.ok(route, `itinerary ${itinerary.id} comes from a recorded route`);
      transitDetailsOf(route).forEach((details, index) => {
        const step = transits[index];
        assert.equal(step.from.name, details.stopDetails.departureStop.name);
        assert.equal(step.to.name, details.stopDetails.arrivalStop.name);
        assert.equal(step.to.time, details.stopDetails.arrivalTime);
        assert.equal(step.line.color, details.transitLine.color);
        assert.equal(step.agency.name, details.transitLine.agencies[0].name);
        assert.equal(step.stopCount, details.stopCount);
        assert.ok(step.path.length >= 2, 'transit leg has a path');
      });
      assert.equal(itinerary.transfers, transits.length - 1);
      assert.ok(Date.parse(itinerary.departureTime) <= Date.parse(transits[0].from.time), 'trip starts with the walk to the first vehicle');
      assert.ok(Date.parse(itinerary.arrivalTime) >= Date.parse(transits.at(-1).to.time));
      // Walking instructions merge: never two walks in a row.
      itinerary.steps.forEach((step, index) => assert.ok(!(step.kind === 'walk' && itinerary.steps[index + 1]?.kind === 'walk')));
    }
  });
}

test('names each walk for where it leads, ending at the destination', () => {
  const [itinerary] = normalizeRoutesResponse(fixture('routes-sbu-mall.json'), REQUEST_TIME, 'Smith Haven Mall');
  const [firstWalk] = itinerary.steps;
  const firstTransit = itinerary.steps.find((step) => step.kind === 'transit');
  assert.equal(firstWalk.kind, 'walk');
  assert.equal(firstWalk.toName, firstTransit.from.name);
  assert.ok(firstWalk.durationSeconds > 60 && firstWalk.distanceMeters > 100);
  assert.equal(itinerary.steps.at(-1).toName, 'Smith Haven Mall');
});

test('drops the seconds-long "walk" between buses at the same stop', () => {
  const itineraries = normalizeRoutesResponse(fixture('routes-sbu-mall.json'), REQUEST_TIME, 'Mall');
  for (const step of itineraries.flatMap((itinerary) => itinerary.steps)) {
    if (step.kind === 'walk') assert.ok(step.durationSeconds >= 30 || step.distanceMeters >= 30);
  }
});

test('maps Google vehicle types to rider-facing modes', () => {
  const steps = normalizeRoutesResponse(fixture('routes-sbu-penn.json'), REQUEST_TIME, 'Penn').flatMap((itinerary) => itinerary.steps);
  assert.ok(steps.some((step) => step.kind === 'transit' && step.mode === 'rail' && step.agency.name === 'Long Island Rail Road'));
  assert.ok(steps.some((step) => step.kind === 'transit' && step.mode === 'bus' && step.agency.name === 'Suffolk County Transit'));
  assert.equal(modeForVehicle('SUBWAY'), 'subway');
  assert.equal(modeForVehicle('FERRY'), 'ferry');
});

test('a route without a fare has none, unless the estimator prices it', () => {
  const raw = fixture('routes-sbu-penn.json');
  assert.ok(normalizeRoutesResponse(raw, REQUEST_TIME, 'Penn').every((itinerary) => itinerary.fare === undefined));
  const estimate = () => ({ text: '$9.99', cents: 999, currency: 'USD', estimated: true });
  assert.ok(normalizeRoutesResponse(raw, REQUEST_TIME, 'Penn', estimate).every((itinerary) => itinerary.fare?.cents === 999));

  const priced = structuredClone(raw);
  priced.routes[0].travelAdvisory = { transitFare: { currencyCode: 'USD', units: '12', nanos: 500000000 } };
  priced.routes[0].localizedValues = { transitFare: { text: '$12.50' } };
  assert.deepEqual(normalizeRoutesResponse(priced, REQUEST_TIME, 'Penn', estimate)[0].fare, { text: '$12.50', cents: 1250, currency: 'USD', estimated: false });
});

test('collapses repeated routes and keeps stable ids', () => {
  const raw = fixture('routes-sbu-penn.json');
  const doubled = { routes: [...raw.routes, ...structuredClone(raw.routes)] };
  const once = normalizeRoutesResponse(raw, REQUEST_TIME, 'Penn');
  assert.deepEqual(normalizeRoutesResponse(doubled, REQUEST_TIME, 'Penn').map((i) => i.id), once.map((i) => i.id));
  assert.deepEqual(normalizeRoutesResponse(raw, REQUEST_TIME, 'Penn').map((i) => i.id), once.map((i) => i.id));
  assert.equal(new Set(once.map((i) => i.id)).size, once.length);
});

test('empty and missing routes give no itineraries', () => {
  assert.deepEqual(normalizeRoutesResponse({}, REQUEST_TIME, 'X'), []);
  assert.deepEqual(normalizeRoutesResponse({ routes: [] }, REQUEST_TIME, 'X'), []);
});

test('builds the transit request: waypoints, time, preference, and modes', () => {
  const now = buildRoutesRequest(baseRequest);
  assert.deepEqual(now.origin, { location: { latLng: { latitude: 40.9126, longitude: -73.1234 } } });
  assert.deepEqual(now.destination, { placeId: 'ChIJ-penn' });
  assert.equal(now.travelMode, 'TRANSIT');
  assert.equal(now.computeAlternativeRoutes, true);
  assert.equal(now.departureTime, undefined);
  assert.equal(now.transitPreferences, undefined, 'all modes and fastest need no preferences');

  assert.equal(buildRoutesRequest({ ...baseRequest, time: { mode: 'depart', at: REQUEST_TIME } }).departureTime, REQUEST_TIME);
  const arrive = buildRoutesRequest({ ...baseRequest, time: { mode: 'arrive', at: REQUEST_TIME } });
  assert.equal(arrive.arrivalTime, REQUEST_TIME);
  assert.equal(arrive.departureTime, undefined);

  assert.deepEqual(buildRoutesRequest({ ...baseRequest, preference: 'transfers' }).transitPreferences, { routingPreference: 'FEWER_TRANSFERS' });
  assert.equal(buildRoutesRequest({ ...baseRequest, preference: 'cheapest' }).transitPreferences, undefined);
  assert.deepEqual(buildRoutesRequest({ ...baseRequest, lessWalking: true }).transitPreferences, { routingPreference: 'LESS_WALKING' });
  assert.deepEqual(buildRoutesRequest({ ...baseRequest, preference: 'transfers', lessWalking: true }).transitPreferences, { routingPreference: 'FEWER_TRANSFERS' });
  assert.deepEqual(buildRoutesRequest({ ...baseRequest, modes: ['subway', 'bus'] }).transitPreferences, { allowedTravelModes: ['SUBWAY', 'LIGHT_RAIL', 'BUS'] });
});

test('decodes Google\'s documented example polyline', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ]);
  assert.deepEqual(decodePolyline(''), []);
});

