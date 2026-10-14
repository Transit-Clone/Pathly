const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { strToU8, zipSync } = require('fflate');

const { buildDerivedData } = require('../lib/gtfsDerivedBuild');
const { extractGtfsArchive, snapshotLimitsFor } = require('../lib/gtfsSnapshots');

/** A feed whose trips alternate between two routes, so each route's rows are interleaved. */
function writeInterleavedFeed(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const trips = ['trip_id,route_id,service_id,direction_id'];
  const times = ['trip_id,stop_id,arrival_time,departure_time,stop_sequence'];
  for (let index = 0; index < 60; index += 1) {
    const route = index % 2 === 0 ? 'A' : 'B';
    trips.push(`T${index},${route},WK,${index % 4 < 2 ? 0 : 1}`);
    for (let stop = 1; stop <= 3; stop += 1) {
      const minute = String(index % 60).padStart(2, '0');
      times.push(`T${index},S${stop},08:${minute}:00,08:${minute}:00,${stop}`);
    }
  }
  fs.writeFileSync(path.join(dir, 'routes.txt'), 'route_id,route_short_name,route_long_name,route_color\nA,A,Route A,112233\nB,B,Route B,445566\n');
  fs.writeFileSync(path.join(dir, 'stops.txt'), 'stop_id,stop_name,stop_lat,stop_lon\nS1,One,40.70,-73.90\nS2,Two,40.71,-73.91\nS3,Three,40.72,-73.92\n');
  fs.writeFileSync(path.join(dir, 'trips.txt'), `${trips.join('\n')}\n`);
  fs.writeFileSync(path.join(dir, 'stop_times.txt'), `${times.join('\n')}\n`);
  fs.writeFileSync(path.join(dir, 'calendar.txt'), 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261001,20261231\n');
}

test("spilled derivation keeps each route's rows in feed order and cleans up", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pathly-derive-'));
  try {
    writeInterleavedFeed(path.join(root, 'feed'));
    const out = path.join(root, 'derived');
    const result = await buildDerivedData('lirr', path.join(root, 'feed'), out);
    assert.deepEqual(result, { routes: 2, stops: 3 });
    const routeA = JSON.parse(fs.readFileSync(path.join(out, 'stop_times', 'A.json'), 'utf8')).rows;
    assert.equal(routeA.length, 90);
    assert.deepEqual(routeA.slice(0, 4).map((row) => row[0]), ['T0', 'T0', 'T0', 'T2']);
    assert.ok(routeA.every((row) => Number(row[0].slice(1)) % 2 === 0));
    assert.ok(fs.existsSync(path.join(out, 'geometry', 'B.json')));
    assert.ok(fs.existsSync(path.join(out, 'manifest.json')));
    assert.equal(fs.existsSync(path.join(out, '.spill')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('size guards follow the agency: the defaults reject what a raised limit accepts', () => {
  const files = {
    'routes.txt': strToU8('route_id,route_short_name\nR1,1\n'),
    'stops.txt': strToU8('stop_id,stop_name,stop_lat,stop_lon\nS1,One,40.9,-73.1\nS2,Two,40.8,-73.2\n'),
    'trips.txt': strToU8('trip_id,route_id,service_id,direction_id\nT1,R1,WK,0\n'),
    'stop_times.txt': strToU8('trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT1,S1,08:00:00,08:00:00,1\nT1,S2,08:10:00,08:10:00,2\n'),
    'calendar.txt': strToU8('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261001,20261231\n'),
  };
  const bytes = zipSync(files, { level: 1 });
  const defaults = snapshotLimitsFor('lirr');
  assert.throws(() => extractGtfsArchive(bytes, { limits: { ...defaults, stopTimeRows: 1 } }), /exceeds 1 rows/);
  assert.throws(() => extractGtfsArchive(bytes, { limits: { ...defaults, archiveBytes: 10 } }), /outside the allowed range/);
  assert.ok(extractGtfsArchive(bytes, { limits: defaults }));
  // Runtime hydration of an on-demand agency leaves the stop times compressed.
  assert.equal(extractGtfsArchive(bytes, { semanticValidation: false, skipStopTimes: true }).files.has('stop_times.txt'), false);
});
