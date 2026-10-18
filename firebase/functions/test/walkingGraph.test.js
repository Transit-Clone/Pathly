const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { pickWalkingNearest } = require('../lib/gtfsDiscovery');
const { haversineMeters } = require('../lib/geo');
const { setWalkingDataForTests, walkingMeters, walkingPath } = require('../lib/walkingGraph');
const { writeWalkingTiles } = require('../lib/walkingTilesBuild');

// A rider beside a highway with no crossing nearby. Stop "across" is 100 m east as the crow
// flies, but the only way over is a bridge 1 km north. Stop "street" is 200 m west, on foot.
const rider = { lat: 40.7050, lon: -73.9000 };
const across = { lat: 40.7050, lon: -73.8988 };
const street = { lat: 40.7050, lon: -73.9024 };
const nodes = [
  rider, // 0
  street, // 1
  { lat: 40.7140, lon: -73.9000 }, // 2: north end of the rider's side
  { lat: 40.7140, lon: -73.8988 }, // 3: over the bridge
  across, // 4
  // 5: a far tile, so the search has to follow an edge into a tile it hasn't loaded yet.
  { lat: 40.7050, lon: -73.8700 },
];
const edge = (a, b) => ({ a, b, meters: haversineMeters(nodes[a].lat, nodes[a].lon, nodes[b].lat, nodes[b].lon) });
const edges = [edge(0, 1), edge(0, 2), edge(2, 3), edge(3, 4), edge(4, 5)];

let dir;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathly-walking-'));
  writeWalkingTiles(dir, nodes, edges);
  setWalkingDataForTests(dir);
});
test.after(() => {
  setWalkingDataForTests(null);
  fs.rmSync(dir, { force: true, recursive: true });
});

test('walking distance follows the streets, not a straight line', () => {
  const straight = haversineMeters(rider.lat, rider.lon, across.lat, across.lon);
  const walk = walkingMeters(rider.lat, rider.lon, across.lat, across.lon, 5_000);
  assert.ok(straight < 110);
  assert.ok(walk > 2_000 && walk < 2_200, `walk was ${walk}`);
  assert.ok(Math.abs(walkingMeters(rider.lat, rider.lon, street.lat, street.lon, 5_000) - 202) < 5);
});

test('walking distance crosses tiles and respects the limit', () => {
  const far = nodes[5];
  const walk = walkingMeters(rider.lat, rider.lon, far.lat, far.lon, 10_000);
  assert.ok(walk > 4_000, `walk was ${walk}`);
  assert.equal(walkingMeters(rider.lat, rider.lon, far.lat, far.lon, 3_000), null);
});

test('the walking path runs from the rider over the bridge to the stop', () => {
  const walk = walkingPath(rider.lat, rider.lon, across.lat, across.lon, 5_000);
  assert.equal(walk.meters, walkingMeters(rider.lat, rider.lon, across.lat, across.lon, 5_000));
  const at = (point) => walk.path.findIndex((step) => Math.abs(step.lat - point.lat) < 1e-6 && Math.abs(step.lon - point.lon) < 1e-6);
  assert.deepEqual(walk.path[0], rider);
  assert.deepEqual(walk.path.at(-1), across);
  // North on the rider's side, over the bridge, then south: in that order.
  const order = [nodes[2], nodes[3]].map(at);
  assert.ok(order[0] > 0 && order[1] > order[0], `path was ${JSON.stringify(walk.path)}`);
  assert.equal(walkingPath(rider.lat, rider.lon, 40.80, -73.90, 5_000), null);
});

test('a point far from every path is off the graph', () => {
  assert.equal(walkingMeters(rider.lat, rider.lon, 40.80, -73.90, 5_000), null);
});

const candidate = (stopId, point) => ({ stopId, name: stopId, ...point, distanceMeters: haversineMeters(rider.lat, rider.lon, point.lat, point.lon) });

test('the nearest stop on foot wins over the nearest in a straight line', () => {
  const picked = pickWalkingNearest([candidate('across', across), candidate('street', street)], rider.lat, rider.lon);
  assert.equal(picked.stop.stopId, 'street');
  assert.ok(Math.abs(picked.walkMeters - 202) < 5);
});

test('without walking data, the straight-line nearest is kept', () => {
  setWalkingDataForTests(path.join(dir, 'missing'));
  try {
    const picked = pickWalkingNearest([candidate('across', across), candidate('street', street)], rider.lat, rider.lon);
    assert.deepEqual([picked.stop.stopId, picked.walkMeters], ['across', null]);
  } finally {
    setWalkingDataForTests(dir);
  }
});

test('candidates farther in straight line than the best walk are never searched', () => {
  const stops = [100, 150, 400, 900].map((meters, index) => ({ stopId: `s${index}`, name: '', lat: index, lon: 0, distanceMeters: meters }));
  const walks = [700, 300, 450, 920];
  const asked = [];
  const picked = pickWalkingNearest(stops, 0, 0, (lat) => { asked.push(lat); return walks[lat]; });
  assert.equal(picked.stop.stopId, 's1');
  assert.deepEqual(asked, [0, 1]);
});

test('stops beyond walking range, or unreachable on foot, use straight line', () => {
  const far = [{ stopId: 'lirr', name: '', lat: 0, lon: 0, distanceMeters: 6_000 }, { stopId: 'other', name: '', lat: 1, lon: 0, distanceMeters: 6_500 }];
  assert.deepEqual(pickWalkingNearest(far, 0, 0, () => { throw new Error('not searched'); }), { stop: far[0], walkMeters: null });
  const near = [{ ...far[0], distanceMeters: 300 }, { ...far[1], distanceMeters: 400 }];
  assert.deepEqual(pickWalkingNearest(near, 0, 0, () => null), { stop: near[0], walkMeters: null });
});
