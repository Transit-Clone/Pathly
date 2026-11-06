const assert = require('node:assert/strict');
const test = require('node:test');

const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const { agenciesNear, agenciesNearStops, findNearbyTransit, pickNearbyRoutes } = require('../lib/gtfsDiscovery');

const route = (routeId, distanceMeters, agencyId = 'suffolk') => ({ agencyId, routeId, distanceMeters });
const ids = (routes) => routes.map((item) => item.routeId);
const isSorted = (routes) => routes.every((item, index) => index === 0 || item.distanceMeters >= routes[index - 1].distanceMeters);

test('a sparse area adds only the closest extra routes needed to reach six', () => {
  const base = [route('a', 300), route('b', 900)];
  // Twenty more routes come into range once the search widens.
  const wider = [...base, ...Array.from({ length: 20 }, (_, index) => route(`far-${index}`, 5_000 - index * 100))];
  const picked = pickNearbyRoutes(base, wider, 6, 40);
  assert.equal(picked.length, 6);
  assert.deepEqual(ids(picked), ['a', 'b', 'far-19', 'far-18', 'far-17', 'far-16']);
  assert.ok(isSorted(picked));
});

test('a dense area lists every route within the base radius, without extras', () => {
  const base = Array.from({ length: 25 }, (_, index) => route(`r${index}`, 50 * (25 - index), 'subway'));
  const picked = pickNearbyRoutes(base, [...base, route('far', 9_000)], 6, 40);
  assert.equal(picked.length, 25);
  assert.ok(!ids(picked).includes('far'));
  assert.ok(isSorted(picked));
});

test('the safety cap only bounds pathological lists', () => {
  const base = Array.from({ length: 50 }, (_, index) => route(`r${index}`, index));
  assert.equal(pickNearbyRoutes(base, base, 6, 40).length, 40);
});

test('Stony Brook widens only to six routes', async () => {
  const routes = await findNearbyTransit(40.9203, -73.1285);
  assert.equal(routes.length, 6);
  assert.ok(isSorted(routes));
  assert.ok(routes.some((item) => item.agencyId === 'lirr' && item.routeId === '10'), 'the Port Jefferson Branch is listed');
  // Nothing from the far edge of the widest search (the old rule reached ~29 km out).
  assert.ok(routes.every((item) => item.distanceMeters < 10_000));
});

test('Midtown lists every route within walking range without widening', async () => {
  const routes = await findNearbyTransit(40.7549, -73.9840);
  assert.ok(routes.length > 25, `expected a long list, got ${routes.length}`);
  assert.ok(isSorted(routes));
  // Every subway route is within the subway's 1.6 km base radius: the search never widened.
  assert.ok(routes.filter((item) => item.agencyId === 'subway').every((item) => item.distanceMeters <= 1_600));
});

test('a cold start loads only the agencies that could be nearby', () => {
  // Stony Brook: none of the city's buses or ferries.
  assert.deepEqual(agenciesNear(40.9126, -73.1234), ['lirr', 'subway', 'nice', 'suffolk']);
  // Valley Stream, at the city line: Queens buses (and those of MTA Bus) reach it, Staten Island's don't.
  const valleyStream = agenciesNear(40.6643, -73.7085);
  assert.ok(valleyStream.includes('qn') && valleyStream.includes('busco'));
  assert.ok(!valleyStream.includes('si') && !valleyStream.includes('bx'));
  // Midtown: everything.
  assert.deepEqual(agenciesNear(40.7549, -73.984), Object.keys(AGENCY_CONFIGS));
});

test('route transfers load only the agencies with a stop near the route', () => {
  // Stony Brook and Port Jefferson: no city bus or ferry stop within transfer distance.
  assert.deepEqual(agenciesNearStops([{ lat: 40.9204, lon: -73.1283 }, { lat: 40.9346, lon: -73.0525 }]), ['lirr', 'subway', 'nice', 'suffolk']);
  // A route that reaches Jamaica picks up the Queens buses there.
  assert.ok(agenciesNearStops([{ lat: 40.9204, lon: -73.1283 }, { lat: 40.6995, lon: -73.8081 }]).includes('qn'));
  // A route with no stops needs only the agencies loaded everywhere.
  assert.deepEqual(agenciesNearStops([]), ['lirr', 'subway', 'nice', 'suffolk']);
});

// The nearby index (gtfsNearbyIndex.ts): saved nightly so a search reads small files, never timetables.
const { availableAgencyIds } = require('../lib/gtfsStaticData');
const { buildAgencyNearbyIndex, cellsMayBeWithin, coverageCells, decodeAgencyNearbyIndex } = require('../lib/gtfsNearbyIndex');

async function savedIndexSource() {
  const saved = new Map();
  for (const agencyId of availableAgencyIds()) {
    const { file, cells } = await buildAgencyNearbyIndex(agencyId, 'test-version');
    // Through JSON, as it's stored.
    saved.set(agencyId, { data: decodeAgencyNearbyIndex(JSON.parse(JSON.stringify(file))), cells });
  }
  const loads = [];
  return {
    loads,
    source: {
      mayHaveStationsWithin: (agencyId, lat, lon, radius) => saved.has(agencyId) && cellsMayBeWithin(saved.get(agencyId).cells, lat, lon, radius),
      load: async (agencyId) => {
        loads.push(agencyId);
        return saved.get(agencyId)?.data ?? null;
      },
    },
  };
}

test('a search from the saved nearby index lists exactly what the timetables do', async () => {
  const { source } = await savedIndexSource();
  const places = [
    [40.9203, -73.1285], // Stony Brook
    [40.7549, -73.984], // Midtown
    [40.6643, -73.7085], // Valley Stream
    [40.7128, -74.006], // Lower Manhattan
    [41.0, -72.3], // the North Fork, sparse
    [40.7, -73.3], // Babylon
    [40.85, -73.87], // the Bronx
    [40.58, -74.15], // Staten Island
  ];
  for (let lat = 40.6; lat <= 41.1; lat += 0.1) for (let lon = -74.1; lon <= -72; lon += 0.3) places.push([lat, lon]);
  for (const [lat, lon] of places) {
    assert.deepStrictEqual(await findNearbyTransit(lat, lon, undefined, source), await findNearbyTransit(lat, lon), `at ${lat}, ${lon}`);
  }
});

test('a search reads a far-away agency only when the close ones are not enough', async () => {
  const { source, loads } = await savedIndexSource();
  // Stony Brook: six routes are found well before the subway's widest pass reaches the city.
  await findNearbyTransit(40.9203, -73.1285, undefined, source);
  assert.ok(!loads.includes('subway'), `read ${loads.join(', ')}`);
  // Midtown reads the subway on the first pass.
  loads.length = 0;
  await findNearbyTransit(40.7549, -73.984, undefined, source);
  assert.ok(loads.includes('subway'));
});

test('the coverage cells never rule out an agency with a station in range', () => {
  const stations = [{ lat: 40.75, lon: -73.99 }, { lat: 40.80999, lon: -73.94001 }];
  const cells = coverageCells(stations);
  for (const station of stations) {
    // Standing at the station, and 500 m north of it with a 500 m radius.
    assert.ok(cellsMayBeWithin(cells, station.lat, station.lon, 1));
    assert.ok(cellsMayBeWithin(cells, station.lat + 500 / 111_000, station.lon, 500));
  }
  // Ten kilometres from both, a 1.6 km search can't reach them.
  assert.ok(!cellsMayBeWithin(cells, 40.65, -73.99, 1_600));
});

test('a walk drawn from the position Nearby reported matches the one looked up by stop', async () => {
  const { getWalkingPathBetween, getWalkingPathToStop } = require('../lib/gtfsDiscovery');
  const [lat, lon] = [40.9203, -73.1285];
  const routes = await findNearbyTransit(lat, lon);
  let compared = 0;
  for (const nearby of routes) {
    for (const stop of [nearby.direction1, nearby.direction0]) {
      if (!stop) continue;
      assert.equal(typeof stop.lat, 'number');
      assert.equal(typeof stop.lon, 'number');
      assert.deepEqual(getWalkingPathBetween(lat, lon, stop.lat, stop.lon), getWalkingPathToStop(nearby.agencyId, stop.stopId, lat, lon));
      compared += 1;
    }
  }
  assert.ok(compared > 0);
});
