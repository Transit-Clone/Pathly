const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { unzipSync, zipSync, strToU8 } = require('fflate');

const { refreshGtfsStaticData } = require('../lib');
const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const {
  assertGtfsServiceIsCurrent,
  createGtfsSnapshotManifest,
  derivedArchiveObject,
  daysUntilGtfsServiceEnd,
  gtfsFeedShouldWaitForStart,
  extractGtfsArchive,
  fillTripDirections,
  hydrateCurrentGtfsSnapshot,
  parseGtfsSnapshotManifest,
  refreshAllGtfsSnapshots,
  refreshGtfsSnapshot,
  resetGtfsSnapshotStateForTests,
  setGtfsDerivedArchiveBuilderForTests,
  setGtfsSnapshotBucketForTests,
  validateAgencySnapshotContract,
} = require('../lib/gtfsSnapshots');
const {
  loadAgencyShapes,
  loadAgencyStaticData,
  loadGlobalStopRouteIndex,
  loadRouteStopCounts,
  prepareAgencyStaticData,
  resetGtfsStaticDataForTests,
} = require('../lib/gtfsStaticData');

function validFiles() {
  return {
    'routes.txt': strToU8('route_id,route_short_name,route_long_name,route_color\nR1,1,Route 1,112233\n'),
    'stops.txt': strToU8('stop_id,stop_name,stop_lat,stop_lon\nS1,Main St,40.9,-73.1\nS2,Second St,40.8,-73.2\n'),
    'trips.txt': strToU8('trip_id,route_id,service_id,direction_id\nT1,R1,WK,0\n'),
    'stop_times.txt': strToU8(
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT1,S1,08:00:00,08:00:00,1\nT1,S2,08:10:00,08:10:00,2\n',
    ),
    'calendar.txt': strToU8('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261001,20261231\n'),
    'feed_info.txt': strToU8('feed_publisher_name,feed_end_date\nPathly Test,20261231\n'),
    'shapes.txt': strToU8('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nshape,0,0,1\n'),
  };
}

function archive(files = validFiles()) {
  return zipSync(files, { level: 1 });
}

function currentLirrFiles(routeName = 'Port Jefferson') {
  return {
    'routes.txt': strToU8(`route_id,route_short_name,route_long_name,route_color\n10,10,${routeName},112233\n`),
    'stops.txt': strToU8(
      'stop_id,stop_name,stop_lat,stop_lon\n14,Huntington,40.9,-73.1\n15,Second Stop,40.8,-73.2\n',
    ),
    'trips.txt': strToU8('trip_id,route_id,service_id,direction_id\nT1,10,WK,0\n'),
    'stop_times.txt': strToU8(
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT1,14,08:00:00,08:00:00,1\nT1,15,08:10:00,08:10:00,2\n',
    ),
    'calendar.txt': strToU8(
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260101,20991231\n',
    ),
    'feed_info.txt': strToU8('feed_publisher_name,feed_end_date\nPathly Test,20991231\n'),
  };
}

const AGENCY_FIXTURES = {
  subway: [
    { routeId: 'E', stopIds: ['G06S', 'G06N'] },
    { routeId: '7', stopIds: ['701S', '701N'] },
  ],
  nice: [{ routeId: 'n4', stopIds: ['2004', '4538'] }],
  suffolk: [
    { routeId: '6859', stopIds: ['11420858', '11259869'] },
    { routeId: '6868', stopIds: ['11283786', '11283946'] },
  ],
  // New agencies have no required fallbacks; any small valid feed will do.
  bx: [{ routeId: 'BX12', stopIds: ['100', '101'] }],
  bk: [{ routeId: 'B44', stopIds: ['200', '201'] }],
  mn: [{ routeId: 'M15', stopIds: ['300', '301'] }],
  qn: [{ routeId: 'Q44', stopIds: ['400', '401'] }],
  si: [{ routeId: 'S79', stopIds: ['500', '501'] }],
  busco: [{ routeId: 'BXM10', stopIds: ['600', '601'] }],
  nycferry: [{ routeId: 'ER', stopIds: ['87', '20'] }],
  siferry: [{ routeId: 'SIF', stopIds: ['stgeorge', 'whitehall'] }],
};

function currentAgencyFiles(agencyId) {
  if (agencyId === 'lirr') return currentLirrFiles();
  const fallbacks = AGENCY_FIXTURES[agencyId];
  const routes = fallbacks
    .map(({ routeId }) => `${routeId},${routeId},${agencyId} ${routeId},112233`)
    .join('\n');
  const stopIds = [...new Set(fallbacks.flatMap(({ stopIds: ids }) => ids))];
  const stops = stopIds
    .map((stopId, index) => `${stopId},${agencyId} stop ${index + 1},${40.9 - index / 100},${-73.1 - index / 100}`)
    .join('\n');
  const trips = fallbacks
    .map(({ routeId }, index) => `T${index + 1},${routeId},WK,${index % 2},${agencyId} headsign`)
    .join('\n');
  const stopTimes = fallbacks.flatMap(({ stopIds: routeStopIds }, index) => routeStopIds.map((stopId, stopIndex) => {
    const minute = String(index * 10 + stopIndex).padStart(2, '0');
    return `T${index + 1},${stopId},08:${minute}:00,08:${minute}:00,${stopIndex + 1}`;
  })).join('\n');

  return {
    'routes.txt': strToU8(`route_id,route_short_name,route_long_name,route_color\n${routes}\n`),
    'stops.txt': strToU8(`stop_id,stop_name,stop_lat,stop_lon\n${stops}\n`),
    'trips.txt': strToU8(`trip_id,route_id,service_id,direction_id,trip_headsign\n${trips}\n`),
    'stop_times.txt': strToU8(
      `trip_id,stop_id,arrival_time,departure_time,stop_sequence\n${stopTimes}\n`,
    ),
    'calendar.txt': strToU8(
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260101,20991231\n',
    ),
    'feed_info.txt': strToU8('feed_publisher_name,feed_end_date\nPathly Test,20991231\n'),
  };
}

function storageError(code) {
  return Object.assign(new Error(`Storage error ${code}`), { code });
}

class FakeBucket {
  constructor() {
    this.nextGeneration = 1;
    this.objects = new Map();
  }

  file(name, options = {}) {
    return {
      delete: async (deleteOptions = {}) => {
        const object = this.objects.get(name);
        if (!object && deleteOptions.ignoreNotFound) return;
        if (!object) throw storageError(404);
        if (
          deleteOptions.ifGenerationMatch !== undefined &&
          deleteOptions.ifGenerationMatch !== object.generation
        ) {
          throw storageError(412);
        }
        this.objects.delete(name);
      },
      download: async () => {
        const object = this.objects.get(name);
        if (!object || (options.generation !== undefined && options.generation !== object.generation)) {
          throw storageError(404);
        }
        return [Buffer.from(object.data)];
      },
      getMetadata: async () => {
        const object = this.objects.get(name);
        if (!object) throw storageError(404);
        return [{ generation: object.generation, size: String(object.data.length) }];
      },
      save: async (data, saveOptions = {}) => {
        const current = this.objects.get(name);
        const expected = saveOptions.preconditionOpts?.ifGenerationMatch;
        if ((expected === 0 && current) || (expected !== undefined && expected !== 0 && current?.generation !== expected)) {
          throw storageError(412);
        }
        const generation = String(this.nextGeneration++);
        this.objects.set(name, { data: Buffer.from(data), generation });
      },
    };
  }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('condition was not reached');
}

test.beforeEach(() => {
  resetGtfsSnapshotStateForTests();
  resetGtfsStaticDataForTests();
});

test('extracts and validates only the GTFS files the runtime consumes', () => {
  const extracted = extractGtfsArchive(archive());
  assert.equal(extracted.files.has('shapes.txt'), true);
  assert.equal(extracted.files.has('stop_times.txt'), true);
  assert.equal(extracted.serviceEndDate, '20261231');
  assert.deepEqual(extracted.metadata.map(({ name }) => name), [
    'calendar.txt',
    'feed_info.txt',
    'routes.txt',
    'shapes.txt',
    'stop_times.txt',
    'stops.txt',
    'trips.txt',
  ]);
});

test('rejects incomplete, malformed, and ambiguous GTFS archives', () => {
  const missingStopTimes = validFiles();
  delete missingStopTimes['stop_times.txt'];
  assert.throws(() => extractGtfsArchive(archive(missingStopTimes)), /missing stop_times\.txt/);

  const badStops = validFiles();
  badStops['stops.txt'] = strToU8('stop_id,stop_name\nS1,Main St\n');
  assert.throws(() => extractGtfsArchive(archive(badStops)), /missing required column stop_lat/);

  const duplicateRoutes = { ...validFiles(), 'nested/routes.txt': validFiles()['routes.txt'] };
  assert.throws(() => extractGtfsArchive(archive(duplicateRoutes)), /duplicate routes\.txt/);

  const unknownStop = validFiles();
  unknownStop['stop_times.txt'] = strToU8(
    'trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT1,missing,08:00:00,08:00:00,1\n',
  );
  assert.throws(() => extractGtfsArchive(archive(unknownStop)), /unknown stop_id missing/);

  const invalidServiceDate = validFiles();
  invalidServiceDate['calendar.txt'] = strToU8(
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261001,20261301\n',
  );
  assert.throws(() => extractGtfsArchive(archive(invalidServiceDate)), /invalid date range/);

  const duplicateCalendar = validFiles();
  duplicateCalendar['calendar.txt'] = strToU8(
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261001,20261231\nWK,1,1,1,1,1,0,0,20261001,20261231\n',
  );
  assert.throws(() => extractGtfsArchive(archive(duplicateCalendar)), /duplicate service_id WK/);

  const duplicateException = validFiles();
  duplicateException['calendar_dates.txt'] = strToU8(
    'service_id,date,exception_type\nWK,20261006,1\nWK,20261006,2\n',
  );
  assert.throws(() => extractGtfsArchive(archive(duplicateException)), /duplicate service_id\/date WK\/20261006/);

  const duplicateSequence = validFiles();
  duplicateSequence['stop_times.txt'] = strToU8(
    'trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT1,S1,08:00:00,08:00:00,1\nT1,S2,08:10:00,08:10:00,1\n',
  );
  assert.throws(() => extractGtfsArchive(archive(duplicateSequence)), /duplicate stop_sequence 1/);
});

test('requires app fallback route and stop IDs before publishing an agency feed', () => {
  const lirrFiles = currentLirrFiles();
  const now = new Date('2026-10-06T12:00:00.000Z');
  validateAgencySnapshotContract('lirr', extractGtfsArchive(archive(lirrFiles)), now);

  assert.throws(() => validateAgencySnapshotContract('lirr', extractGtfsArchive(archive()), now), /required route_id 10/);

  const orphanStop = currentLirrFiles();
  orphanStop['stop_times.txt'] = strToU8(
    'trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT1,15,08:00:00,08:00:00,1\nT1,15,08:10:00,08:10:00,2\n',
  );
  assert.throws(
    () => validateAgencySnapshotContract('lirr', extractGtfsArchive(archive(orphanStop)), now),
    /required stop_id 14 is not served by current route_id 10/,
  );

  const inactiveRoute = currentLirrFiles();
  inactiveRoute['calendar.txt'] = strToU8(
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20270101,20991231\n',
  );
  assert.throws(
    () => validateAgencySnapshotContract('lirr', extractGtfsArchive(archive(inactiveRoute)), now),
    /required route_id 10 has no current trips/,
  );
});

test('keeps the published feed until a new one starts, unless the published one has ended', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');
  const upcomingFiles = validFiles();
  upcomingFiles['calendar.txt'] = strToU8(
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261007,20261231\n',
  );
  const upcoming = extractGtfsArchive(archive(upcomingFiles));
  assert.equal(gtfsFeedShouldWaitForStart(upcoming, '20261006', now), true);
  // The published feed ended, or there is none: better the upcoming feed than nothing.
  assert.equal(gtfsFeedShouldWaitForStart(upcoming, '20261005', now), false);
  assert.equal(gtfsFeedShouldWaitForStart(upcoming, undefined, now), false);
  // The day it starts, and any feed already running, publish as usual.
  assert.equal(gtfsFeedShouldWaitForStart(upcoming, '20261031', new Date('2026-10-07T12:00:00.000Z')), false);
  assert.equal(gtfsFeedShouldWaitForStart(extractGtfsArchive(archive()), '20261031', now), false);
});

test('rejects missing or expired service horizons', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');
  assert.equal(daysUntilGtfsServiceEnd('20261006', now), 0);
  assert.equal(daysUntilGtfsServiceEnd('20261020', now), 14);
  assert.equal(daysUntilGtfsServiceEnd('20261005', now), -1);
  assert.throws(() => daysUntilGtfsServiceEnd(null, now), /no valid service end date/);

  assert.equal(assertGtfsServiceIsCurrent(extractGtfsArchive(archive()), now), 86);

  const seasonalFiles = validFiles();
  seasonalFiles['calendar.txt'] = strToU8(
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261201,20261231\n',
  );
  assert.throws(
    () => assertGtfsServiceIsCurrent(extractGtfsArchive(archive(seasonalFiles)), now),
    /no trip-referenced service today or tomorrow/,
  );
});

test('computes service horizon from runnable service rather than removal exceptions', () => {
  const files = validFiles();
  files['calendar_dates.txt'] = strToU8(
    'service_id,date,exception_type\nWK,20991231,2\n',
  );
  assert.equal(extractGtfsArchive(archive(files)).serviceEndDate, '20261231');
});

test('creates and validates an immutable atomic snapshot manifest', () => {
  const bytes = archive();
  const extracted = extractGtfsArchive(bytes);
  const manifest = createGtfsSnapshotManifest(
    'lirr',
    'https://example.com/lirr.zip',
    bytes,
    extracted,
    new Date('2026-10-06T12:00:00.000Z'),
  );

  assert.match(manifest.version, /^[a-f0-9]{64}$/);
  assert.match(manifest.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.archiveObject, `gtfs/v1/lirr/versions/${manifest.archiveSha256}.zip`);
  assert.deepEqual(parseGtfsSnapshotManifest(structuredClone(manifest), 'lirr'), manifest);

  const unsafe = { ...manifest, archiveObject: 'gtfs/v1/subway/versions/other.zip' };
  assert.throws(() => parseGtfsSnapshotManifest(unsafe, 'lirr'), /archive object is invalid/);
});

test('validates the optional prepared-data archive in a snapshot manifest', () => {
  const bytes = archive();
  const manifest = createGtfsSnapshotManifest('lirr', 'https://example.com/lirr.zip', bytes, extractGtfsArchive(bytes), new Date('2026-10-06T12:00:00.000Z'));
  assert.equal('derived' in manifest, false);
  assert.deepEqual(parseGtfsSnapshotManifest(structuredClone(manifest), 'lirr'), manifest);

  const derived = { version: 3, object: derivedArchiveObject('lirr', manifest.version, 3), sha256: 'a'.repeat(64), size: 1024 };
  const withDerived = { ...manifest, derived };
  assert.equal(derived.object, `gtfs/v1/lirr/derived/${manifest.version}-v3.zip`);
  assert.deepEqual(parseGtfsSnapshotManifest(structuredClone(withDerived), 'lirr'), withDerived);

  const invalid = [
    { ...derived, object: derivedArchiveObject('lirr', 'b'.repeat(64), 3) },
    { ...derived, object: derivedArchiveObject('subway', manifest.version, 3) },
    { ...derived, version: 2 },
    { ...derived, version: 0, object: derivedArchiveObject('lirr', manifest.version, 0) },
    { ...derived, sha256: 'not-a-hash' },
    { ...derived, size: 0 },
    { ...derived, size: 32 * 1024 * 1024 + 1 },
    null,
  ];
  for (const value of invalid) {
    assert.throws(() => parseGtfsSnapshotManifest({ ...manifest, derived: value }, 'lirr'), /prepared-data archive is invalid/);
  }
});

test('uses bundled GTFS outside deployed Cloud Functions', async () => {
  assert.equal(await hydrateCurrentGtfsSnapshot('lirr'), null);
});

test('shares one stop-times scan between global and per-route discovery indexes', async () => {
  // Exercises the full-scan path; prepared indexes (scripts/build-gtfs-index.js) skip the scan entirely.
  process.env.GTFS_DERIVED_DISABLED = '1';
  const originalCreateReadStream = fs.createReadStream;
  let scans = 0;
  fs.createReadStream = function (...args) {
    scans += 1;
    return originalCreateReadStream.apply(this, args);
  };
  try {
    await Promise.all([
      loadGlobalStopRouteIndex('lirr'),
      loadRouteStopCounts('lirr', '1'),
      loadRouteStopCounts('lirr', '2'),
    ]);
  } finally {
    fs.createReadStream = originalCreateReadStream;
    delete process.env.GTFS_DERIVED_DISABLED;
  }
  assert.equal(scans, 1);
});

test('prevents a slower stale refresh from replacing a newer snapshot', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const pendingFetches = [];
  global.fetch = async () => new Promise((resolve) => pendingFetches.push(resolve));

  try {
    const oldArchive = archive(currentLirrFiles('Old feed'));
    const newArchive = archive(currentLirrFiles('New feed'));
    const slowRefresh = refreshGtfsSnapshot('lirr');
    await waitFor(() => pendingFetches.length === 1);
    const fastRefresh = refreshGtfsSnapshot('lirr');
    await waitFor(() => pendingFetches.length === 2);

    pendingFetches[1](new Response(newArchive));
    assert.equal(await fastRefresh, 'published');
    pendingFetches[0](new Response(oldArchive));
    await assert.rejects(slowRefresh, /manifest changed during publication/);

    const current = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    const expected = createGtfsSnapshotManifest(
      'lirr',
      'https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip',
      newArchive,
      extractGtfsArchive(newArchive),
    );
    assert.equal(current.version, expected.version);
  } finally {
    global.fetch = originalFetch;
  }
});

test('treats an overlapping same-version publisher as idempotent', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const pendingFetches = [];
  global.fetch = async () => new Promise((resolve) => pendingFetches.push(resolve));

  try {
    const bytes = archive(currentLirrFiles());
    const first = refreshGtfsSnapshot('lirr');
    await waitFor(() => pendingFetches.length === 1);
    const second = refreshGtfsSnapshot('lirr');
    await waitFor(() => pendingFetches.length === 2);
    pendingFetches[1](new Response(bytes));
    assert.equal(await second, 'published');
    pendingFetches[0](new Response(bytes));
    assert.equal(await first, 'unchanged');
  } finally {
    global.fetch = originalFetch;
  }
});

test('repairs a missing archive and an invalid current manifest', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const bytes = archive(currentLirrFiles());
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(bytes);

  try {
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    const currentObject = 'gtfs/v1/lirr/current.json';
    const firstManifest = JSON.parse(fakeBucket.objects.get(currentObject).data.toString('utf8'));
    fakeBucket.objects.delete(firstManifest.archiveObject);

    assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged');
    assert.equal(fakeBucket.objects.has(firstManifest.archiveObject), true);

    fakeBucket.objects.get(firstManifest.archiveObject).data = Buffer.from('corrupt');
    assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged');
    assert.deepEqual(fakeBucket.objects.get(firstManifest.archiveObject).data, Buffer.from(bytes));

    const current = fakeBucket.objects.get(currentObject);
    current.data = Buffer.from('{not json');
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    assert.doesNotThrow(() => JSON.parse(fakeBucket.objects.get(currentObject).data.toString('utf8')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('rejects a sequential source replay with an older Last-Modified timestamp', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const current = archive(currentLirrFiles('Current feed'));
  const replay = archive(currentLirrFiles('Replayed older feed'));

  try {
    global.fetch = async () => new Response(current, {
      headers: { 'last-modified': 'Tue, 06 Oct 2026 12:00:00 GMT' },
    });
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    global.fetch = async () => new Response(replay, {
      headers: { 'last-modified': 'Mon, 05 Oct 2026 12:00:00 GMT' },
    });
    await assert.rejects(refreshGtfsSnapshot('lirr'), /Last-Modified moved backward/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('advances the source watermark without activating a logically identical repack', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const first = archive({
    ...currentLirrFiles(),
    'agency.txt': strToU8('agency_id,agency_name,agency_url,agency_timezone\nold,Old,https://example.com,America/New_York\n'),
  });
  const repacked = archive({
    ...currentLirrFiles(),
    'agency.txt': strToU8('agency_id,agency_name,agency_url,agency_timezone\nnew,New,https://example.com,America/New_York\n'),
  });

  try {
    global.fetch = async () => new Response(first, {
      headers: { 'last-modified': 'Tue, 06 Oct 2026 12:00:00 GMT' },
    });
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    const firstManifest = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));

    global.fetch = async () => new Response(repacked, {
      headers: { 'last-modified': 'Wed, 07 Oct 2026 12:00:00 GMT' },
    });
    assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged');
    const refreshed = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    assert.equal(refreshed.version, firstManifest.version);
    assert.equal(refreshed.archiveSha256, firstManifest.archiveSha256);
    assert.equal(refreshed.sourceLastModified, '2026-10-07T12:00:00.000Z');
    assert.equal([...fakeBucket.objects.keys()].filter((name) => name.startsWith('gtfs/v1/lirr/versions/')).length, 1);

    fakeBucket.objects.delete(refreshed.archiveObject);
    const repairRepack = archive({
      ...currentLirrFiles(),
      'agency.txt': strToU8('agency_id,agency_name,agency_url,agency_timezone\nrepair,Repair,https://example.com,America/New_York\n'),
    });
    global.fetch = async () => new Response(repairRepack, {
      headers: { 'last-modified': 'Thu, 08 Oct 2026 12:00:00 GMT' },
    });
    assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged');
    const repaired = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    assert.equal(repaired.version, firstManifest.version);
    assert.notEqual(repaired.archiveObject, refreshed.archiveObject);
    assert.equal(fakeBucket.objects.has(repaired.archiveObject), true);

    global.fetch = async () => new Response(repairRepack);
    await assert.rejects(refreshGtfsSnapshot('lirr'), /omitted Last-Modified/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('retains immutable archive history while tracking the immediately previous archive', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  let sourceVersion = 0;
  global.fetch = async () => {
    sourceVersion += 1;
    return new Response(archive(currentLirrFiles(`Version ${sourceVersion}`)), {
      headers: { 'last-modified': `Tue, 0${sourceVersion} Oct 2026 12:00:00 GMT` },
    });
  };

  try {
    await refreshGtfsSnapshot('lirr');
    const first = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    await refreshGtfsSnapshot('lirr');
    const second = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    await refreshGtfsSnapshot('lirr');
    const third = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));

    assert.equal(fakeBucket.objects.has(first.archiveObject), true);
    assert.equal(fakeBucket.objects.has(second.archiveObject), true);
    assert.equal(fakeBucket.objects.has(third.archiveObject), true);
    assert.equal(third.previousArchiveObject, second.archiveObject);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reuses a retained archive when content rolls from A to B back to A', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const versions = [
    archive(currentLirrFiles('Version A')),
    archive(currentLirrFiles('Version B')),
    archive(currentLirrFiles('Version A')),
  ];
  let index = 0;
  global.fetch = async () => {
    const response = new Response(versions[index], {
      headers: { 'last-modified': `Tue, 0${index + 1} Oct 2026 12:00:00 GMT` },
    });
    index += 1;
    return response;
  };

  try {
    await refreshGtfsSnapshot('lirr');
    const first = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    await refreshGtfsSnapshot('lirr');
    const second = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));
    await refreshGtfsSnapshot('lirr');
    const current = JSON.parse(fakeBucket.objects.get('gtfs/v1/lirr/current.json').data.toString('utf8'));

    assert.equal(current.archiveObject, first.archiveObject);
    assert.equal(current.previousArchiveObject, second.archiveObject);
    assert.equal(fakeBucket.objects.has(first.archiveObject), true);
    assert.equal(fakeBucket.objects.has(second.archiveObject), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rejects oversized stored objects before downloading them', async () => {
  let downloads = 0;
  const oversizedBucket = {
    file: () => ({
      download: async () => {
        downloads += 1;
        throw new Error('should not download');
      },
      getMetadata: async () => [{ generation: '1', size: String(17 * 1024 * 1024) }],
    }),
  };
  setGtfsSnapshotBucketForTests(oversizedBucket);
  const originalOverride = process.env.GTFS_USE_CLOUD_STORAGE;
  process.env.GTFS_USE_CLOUD_STORAGE = 'true';
  try {
    assert.equal(await hydrateCurrentGtfsSnapshot('lirr', 1_000_000), null);
    assert.equal(downloads, 0);
  } finally {
    if (originalOverride === undefined) delete process.env.GTFS_USE_CLOUD_STORAGE;
    else process.env.GTFS_USE_CLOUD_STORAGE = originalOverride;
  }
});

test('activates new remote snapshots through the static-data readers and keeps the last good version', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const originalOverride = process.env.GTFS_USE_CLOUD_STORAGE;
  process.env.GTFS_USE_CLOUD_STORAGE = 'true';

  try {
    global.fetch = async () => new Response(archive({
      ...currentLirrFiles('Remote version one'),
      'shapes.txt': strToU8('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nroute-shape,40.1,-73.1,1\n'),
    }));
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    await prepareAgencyStaticData('lirr', 1_000_000);
    assert.equal(loadAgencyStaticData('lirr').routesById.get('10').name, 'Remote version one');
    assert.deepEqual(loadAgencyShapes('lirr').get('route-shape'), [{ lat: 40.1, lon: -73.1 }]);

    global.fetch = async () => new Response(archive({
      ...currentLirrFiles('Remote version two'),
      'shapes.txt': strToU8('shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nroute-shape,40.2,-73.2,1\n'),
    }));
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    await prepareAgencyStaticData('lirr', 1_300_001);
    assert.equal(loadAgencyStaticData('lirr').routesById.get('10').name, 'Remote version two');
    assert.deepEqual(loadAgencyShapes('lirr').get('route-shape'), [{ lat: 40.2, lon: -73.2 }]);

    fakeBucket.objects.get('gtfs/v1/lirr/current.json').data = Buffer.from('{not json');
    await prepareAgencyStaticData('lirr', 1_600_002);
    assert.equal(loadAgencyStaticData('lirr').routesById.get('10').name, 'Remote version two');
  } finally {
    global.fetch = originalFetch;
    if (originalOverride === undefined) delete process.env.GTFS_USE_CLOUD_STORAGE;
    else process.env.GTFS_USE_CLOUD_STORAGE = originalOverride;
  }
});

/** Runs `body` with every GTFS download answered by `files` (LIRR's fixture by default). */
async function withLirrFeed(body, files = currentLirrFiles()) {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(archive(files));
  try {
    return await body();
  } finally {
    global.fetch = originalFetch;
  }
}

function currentManifest(fakeBucket, agencyId = 'lirr') {
  return JSON.parse(fakeBucket.objects.get(`gtfs/v1/${agencyId}/current.json`).data.toString('utf-8'));
}

test('publishes prepared timetable indexes alongside a new snapshot', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'published'));

  const manifest = parseGtfsSnapshotManifest(currentManifest(fakeBucket), 'lirr');
  assert.ok(manifest.derived, 'manifest references the prepared archive');
  assert.equal(manifest.derived.object, derivedArchiveObject('lirr', manifest.version, manifest.derived.version));
  const stored = fakeBucket.objects.get(manifest.derived.object).data;
  assert.equal(stored.length, manifest.derived.size);
  const entries = unzipSync(new Uint8Array(stored));
  for (const name of ['manifest.json', 'stop-indexes.json', 'stop_times/10.json', 'geometry/10.json']) {
    assert.ok(entries[name], `prepared archive contains ${name}`);
  }
  const geometry = JSON.parse(Buffer.from(entries['geometry/10.json']).toString('utf-8'));
  assert.deepEqual(geometry[0].stops.map((stop) => stop.name), ['Huntington', 'Second Stop']);
  assert.equal(geometry[1], null);
});

test('still publishes a snapshot when its prepared indexes cannot be built, then backfills them', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  setGtfsDerivedArchiveBuilderForTests(async () => {
    throw new Error('builder exploded');
  });
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'published'));
  const published = currentManifest(fakeBucket);
  assert.equal('derived' in published, false);

  // The next run sees the same feed, so the timetable version stays put and only gains indexes.
  setGtfsDerivedArchiveBuilderForTests(undefined);
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged'));
  const backfilled = parseGtfsSnapshotManifest(currentManifest(fakeBucket), 'lirr');
  assert.equal(backfilled.version, published.version);
  assert.equal(backfilled.archiveObject, published.archiveObject);
  assert.ok(backfilled.derived);
  assert.ok(fakeBucket.objects.has(backfilled.derived.object));
});

test('leaves a snapshot with current prepared indexes untouched', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'published'));
  const generationBefore = fakeBucket.nextGeneration;
  let builds = 0;
  setGtfsDerivedArchiveBuilderForTests(async () => {
    builds += 1;
    return Buffer.alloc(0);
  });
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged'));
  assert.equal(builds, 0);
  assert.equal(fakeBucket.nextGeneration, generationBefore, 'nothing was written');
});

test('keeps a prepared archive another run already published for the same snapshot', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'published'));
  const first = currentManifest(fakeBucket);
  const storedBefore = fakeBucket.objects.get(first.derived.object);

  // Force a rebuild (as after a format bump would) while the object name is already taken.
  fakeBucket.objects.get('gtfs/v1/lirr/current.json').data = Buffer.from(JSON.stringify({ ...first, derived: undefined }));
  setGtfsDerivedArchiveBuilderForTests(async () => Buffer.from('a different but equivalent build'));
  await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged'));
  const second = currentManifest(fakeBucket);
  assert.equal(fakeBucket.objects.get(first.derived.object), storedBefore, 'the published archive was not replaced');
  assert.deepEqual(second.derived, first.derived);
});

/** What the LIRR loaders answer for the fixture route, from whichever data the snapshot hydrated. */
async function lirrAnswers() {
  const { findNearestStops, getRouteGeometry } = require('../lib/gtfsDiscovery');
  const { loadRouteStopTimes } = require('../lib/gtfsStaticData');
  return {
    // As the callable sends it: JSON drops the fixture's missing (undefined) headsign either way.
    geometry: JSON.parse(JSON.stringify([await getRouteGeometry('lirr', '10', 0), await getRouteGeometry('lirr', '10', 1)])),
    nearest: await findNearestStops('lirr', 40.9, -73.1),
    stopTimes: await loadRouteStopTimes('lirr', '10'),
    counts: await loadRouteStopCounts('lirr', '10'),
  };
}

/** Publishes the LIRR fixture (with prepared indexes unless the builder is stubbed), then hydrates it into a clean /tmp cache. */
async function hydratePreparedLirr(fakeBucket, tamper, { answers = true } = {}) {
  const originalOverride = process.env.GTFS_USE_CLOUD_STORAGE;
  process.env.GTFS_USE_CLOUD_STORAGE = 'true';
  try {
    await withLirrFeed(async () => assert.equal(await refreshGtfsSnapshot('lirr'), 'published'));
    const manifest = currentManifest(fakeBucket);
    if (tamper) tamper(fakeBucket.objects.get(manifest.derived.object));
    // Hydrated folders are content-addressed and outlive a test run on developer machines.
    fs.rmSync(path.join(os.tmpdir(), 'pathly-gtfs', 'lirr', manifest.version), { recursive: true, force: true });
    await prepareAgencyStaticData('lirr', 1_000_000);
    return { dataDir: path.join(os.tmpdir(), 'pathly-gtfs', 'lirr', manifest.version), answers: answers ? await lirrAnswers() : undefined };
  } finally {
    if (originalOverride === undefined) delete process.env.GTFS_USE_CLOUD_STORAGE;
    else process.env.GTFS_USE_CLOUD_STORAGE = originalOverride;
  }
}

test('hydrates prepared timetable indexes instead of the raw stop times', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const prepared = await hydratePreparedLirr(fakeBucket);
  assert.equal(fs.existsSync(path.join(prepared.dataDir, 'derived', 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(prepared.dataDir, 'derived', 'geometry', '10.json')), true);
  assert.equal(fs.existsSync(path.join(prepared.dataDir, 'stop_times.txt')), false);
  assert.deepEqual(prepared.answers.geometry[0].stops.map((stop) => stop.name), ['Huntington', 'Second Stop']);

  // The same snapshot published without prepared indexes is answered by scanning its raw files,
  // with identical results.
  resetGtfsSnapshotStateForTests();
  resetGtfsStaticDataForTests();
  const rawBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(rawBucket);
  setGtfsDerivedArchiveBuilderForTests(async () => {
    throw new Error('no prepared indexes for this comparison');
  });
  const raw = await hydratePreparedLirr(rawBucket);
  assert.equal(raw.dataDir, prepared.dataDir, 'same snapshot version');
  assert.equal(fs.existsSync(path.join(raw.dataDir, 'stop_times.txt')), true);
  assert.equal(fs.existsSync(path.join(raw.dataDir, 'derived')), false);
  assert.deepEqual(raw.answers, prepared.answers);
});

test('falls back to the raw stop times when a prepared archive fails verification', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const tampered = await hydratePreparedLirr(fakeBucket, (object) => {
    object.data = Buffer.from(object.data);
    object.data[object.data.length - 1] ^= 0xff;
  });
  assert.equal(fs.existsSync(path.join(tampered.dataDir, 'derived')), false);
  assert.equal(fs.existsSync(path.join(tampered.dataDir, 'stop_times.txt')), true);
  assert.deepEqual(tampered.answers.geometry[0].stops.map((stop) => stop.name), ['Huntington', 'Second Stop']);
  assert.equal(tampered.answers.geometry[1], null);
});

test('rejects a prepared archive with unexpected entries', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  setGtfsDerivedArchiveBuilderForTests(async () => Buffer.from(zipSync({ 'manifest.json': strToU8('{}'), 'stop-indexes.json': strToU8('{}'), '../escape.json': strToU8('{}') })));
  const hydrated = await hydratePreparedLirr(fakeBucket);
  assert.equal(fs.existsSync(path.join(hydrated.dataDir, 'derived')), false);
  assert.equal(fs.existsSync(path.join(hydrated.dataDir, 'stop_times.txt')), true);
});

test('refreshes every agency successfully in one scheduled run', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const agencyId = Object.values(AGENCY_CONFIGS).find((config) => config.staticFeedUrl === String(url))?.id;
    assert.ok(agencyId, `unexpected GTFS URL ${url}`);
    return new Response(archive(currentAgencyFiles(agencyId)));
  };

  try {
    await refreshAllGtfsSnapshots();
    for (const agencyId of Object.keys(AGENCY_CONFIGS)) {
      assert.equal(fakeBucket.objects.has(`gtfs/v1/${agencyId}/current.json`), true);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('continues refreshing other agencies before rejecting a partial scheduled failure', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const agencyId = Object.values(AGENCY_CONFIGS).find((config) => config.staticFeedUrl === String(url))?.id;
    assert.ok(agencyId, `unexpected GTFS URL ${url}`);
    if (agencyId === 'nice') return new Response('unavailable', { status: 503 });
    return new Response(archive(currentAgencyFiles(agencyId)));
  };

  try {
    await assert.rejects(refreshAllGtfsSnapshots(), /failed for nice/);
    assert.equal(fakeBucket.objects.has('gtfs/v1/lirr/current.json'), true);
    assert.equal(fakeBucket.objects.has('gtfs/v1/subway/current.json'), true);
    assert.equal(fakeBucket.objects.has('gtfs/v1/nice/current.json'), false);
    assert.equal(fakeBucket.objects.has('gtfs/v1/suffolk/current.json'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('shares handled storage failures across concurrent snapshot checks', async () => {
  const failingBucket = {
    file: () => ({
      getMetadata: async () => {
        throw storageError(500);
      },
    }),
  };
  setGtfsSnapshotBucketForTests(failingBucket);
  const originalOverride = process.env.GTFS_USE_CLOUD_STORAGE;
  process.env.GTFS_USE_CLOUD_STORAGE = 'true';
  try {
    const [first, second] = await Promise.all([
      hydrateCurrentGtfsSnapshot('lirr', 1_000),
      hydrateCurrentGtfsSnapshot('lirr', 1_000),
    ]);
    assert.equal(first, null);
    assert.equal(second, null);
  } finally {
    if (originalOverride === undefined) delete process.env.GTFS_USE_CLOUD_STORAGE;
    else process.env.GTFS_USE_CLOUD_STORAGE = originalOverride;
  }
});

test('falls back before stalled Storage retries can outlive the callable', async () => {
  const stalledBucket = {
    file: () => ({
      getMetadata: () => new Promise(() => {}),
    }),
  };
  setGtfsSnapshotBucketForTests(stalledBucket);
  const originalOverride = process.env.GTFS_USE_CLOUD_STORAGE;
  process.env.GTFS_USE_CLOUD_STORAGE = 'true';
  try {
    const startedAt = Date.now();
    assert.equal(await hydrateCurrentGtfsSnapshot('lirr', 1_000_000, 5), null);
    assert.ok(Date.now() - startedAt < 1_000);
  } finally {
    if (originalOverride === undefined) delete process.env.GTFS_USE_CLOUD_STORAGE;
    else process.env.GTFS_USE_CLOUD_STORAGE = originalOverride;
  }
});

test('exports a bounded daily scheduled function', () => {
  const endpoint = refreshGtfsStaticData.__endpoint;
  assert.equal(endpoint.availableMemoryMb, 4096);
  assert.equal(endpoint.concurrency, 1);
  assert.equal(endpoint.maxInstances, 1);
  assert.equal(endpoint.serviceAccountEmail, 'pathly-gtfs-writer@pathly-b7f0f.iam.gserviceaccount.com');
  assert.equal(endpoint.timeoutSeconds, 1800);
  assert.equal(endpoint.scheduleTrigger.schedule, '15 0 * * *');
  assert.equal(endpoint.scheduleTrigger.timeZone, 'America/New_York');
  assert.equal(endpoint.scheduleTrigger.retryConfig.retryCount, 3);
  assert.equal(endpoint.scheduleTrigger.retryConfig.minBackoffSeconds, 60);
  assert.equal(endpoint.scheduleTrigger.retryConfig.maxBackoffSeconds, 300);
});

/** Runs `body` with LIRR treated as an on-demand agency (as the city bus feeds are). */
async function asOnDemandLirr(body) {
  const config = AGENCY_CONFIGS.lirr;
  const original = config.onDemandRouteFiles;
  config.onDemandRouteFiles = true;
  try {
    return await body();
  } finally {
    if (original === undefined) delete config.onDemandRouteFiles;
    else config.onDemandRouteFiles = original;
  }
}

/** Counts downloads per object, to see what an instance actually fetches. */
function countDownloads(fakeBucket) {
  const counts = new Map();
  const file = fakeBucket.file.bind(fakeBucket);
  fakeBucket.file = (name, options) => {
    const handle = file(name, options);
    const download = handle.download;
    handle.download = async () => {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return download();
    };
    return handle;
  };
  return counts;
}

test('an on-demand agency publishes each route file on its own and loads it only when asked', async () => {
  await asOnDemandLirr(async () => {
    const fakeBucket = new FakeBucket();
    setGtfsSnapshotBucketForTests(fakeBucket);
    const downloads = countDownloads(fakeBucket);
    const onDemand = await hydratePreparedLirr(fakeBucket, undefined, { answers: false });
    const manifest = parseGtfsSnapshotManifest(currentManifest(fakeBucket), 'lirr');
    const prefix = manifest.derived.routeFilesPrefix;
    assert.ok(prefix, 'manifest points at the route files');
    assert.ok(fakeBucket.objects.has(`${prefix}/stop_times/10.json`));
    assert.ok(fakeBucket.objects.has(`${prefix}/geometry/10.json`));
    const core = Object.keys(unzipSync(fakeBucket.objects.get(manifest.derived.object).data)).sort();
    assert.deepEqual(core, ['manifest.json', 'route-files.json', 'stop-indexes.json']);

    // Hydration wrote neither the raw stop times nor any route file.
    assert.equal(fs.existsSync(path.join(onDemand.dataDir, 'stop_times.txt')), false);
    assert.equal(fs.existsSync(path.join(onDemand.dataDir, 'derived', 'stop_times')), false);
    assert.equal(downloads.get(`${prefix}/stop_times/10.json`), undefined);

    // First use fetches the route; the second is served from the cache. Answers match a whole hydration.
    const answers = await lirrAnswers();
    await lirrAnswers();
    assert.equal(downloads.get(`${prefix}/stop_times/10.json`), 1);
    assert.equal(downloads.get(`${prefix}/geometry/10.json`), 1);
    resetGtfsSnapshotStateForTests();
    resetGtfsStaticDataForTests();
    const wholeBucket = new FakeBucket();
    setGtfsSnapshotBucketForTests(wholeBucket);
    AGENCY_CONFIGS.lirr.onDemandRouteFiles = false;
    const whole = await hydratePreparedLirr(wholeBucket);
    AGENCY_CONFIGS.lirr.onDemandRouteFiles = true;
    assert.deepEqual(answers, whole.answers);
  });
});

test('a tampered on-demand route file is rejected', async () => {
  await asOnDemandLirr(async () => {
    const fakeBucket = new FakeBucket();
    setGtfsSnapshotBucketForTests(fakeBucket);
    await hydratePreparedLirr(fakeBucket, undefined, { answers: false });
    const prefix = currentManifest(fakeBucket).derived.routeFilesPrefix;
    const object = fakeBucket.objects.get(`${prefix}/geometry/10.json`);
    object.data = Buffer.from(object.data.toString('utf-8').replace('Huntington', 'Elsewhere!'));
    const { loadPreparedRouteGeometry } = require('../lib/gtfsStaticData');
    assert.equal(await loadPreparedRouteGeometry('lirr', '10'), null);
  });
});

test('an on-demand agency without a published snapshot is skipped', async () => {
  await asOnDemandLirr(async () => {
    setGtfsSnapshotBucketForTests(new FakeBucket());
    const originalOverride = process.env.GTFS_USE_CLOUD_STORAGE;
    process.env.GTFS_USE_CLOUD_STORAGE = 'true';
    try {
      await prepareAgencyStaticData('lirr', 1_000_000);
    } finally {
      if (originalOverride === undefined) delete process.env.GTFS_USE_CLOUD_STORAGE;
      else process.env.GTFS_USE_CLOUD_STORAGE = originalOverride;
    }
    const { availableAgencyIds, isAgencyAvailable } = require('../lib/gtfsStaticData');
    assert.equal(isAgencyAvailable('lirr'), false);
    assert.equal(availableAgencyIds().includes('lirr'), false);
    assert.equal(availableAgencyIds().includes('subway'), true);
  });
});

test('the on-demand cache evicts the least recently used routes beyond its budget', async () => {
  const { WeightedLru } = require('../lib/gtfsStaticData');
  const cache = new WeightedLru(10, (value) => value);
  cache.set('a', Promise.resolve(4));
  cache.set('b', Promise.resolve(4));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(cache.get('a'), 'touching a makes b the oldest');
  cache.set('c', Promise.resolve(4));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cache.get('b'), undefined);
  assert.ok(cache.get('a'));
  assert.ok(cache.get('c'));
  // A failed load isn't kept.
  cache.set('d', Promise.reject(new Error('offline')));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cache.get('d'), undefined);
});

/** Publishes the LIRR fixture under `routeName` (each name is a new version). */
async function publishLirrVersion(routeName) {
  return withLirrFeed(() => refreshGtfsSnapshot('lirr'), currentLirrFiles(routeName));
}

/** Makes the current manifest look `days` old, as if a day or more had passed since it was published. */
function ageCurrentManifest(fakeBucket, days) {
  const object = fakeBucket.objects.get('gtfs/v1/lirr/current.json');
  const manifest = JSON.parse(object.data.toString('utf-8'));
  manifest.publishedAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  object.data = Buffer.from(JSON.stringify(manifest));
}

test('deletes the version from two publications back, keeping the live two', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  await publishLirrVersion('First');
  const first = currentManifest(fakeBucket);
  await publishLirrVersion('Second');
  const second = currentManifest(fakeBucket);
  assert.deepEqual(second.previousDerived, { object: first.derived.object });
  ageCurrentManifest(fakeBucket, 2);
  await publishLirrVersion('Third');
  const third = currentManifest(fakeBucket);

  assert.equal(fakeBucket.objects.has(first.archiveObject), false);
  assert.equal(fakeBucket.objects.has(first.derived.object), false);
  for (const live of [second.archiveObject, second.derived.object, third.archiveObject, third.derived.object]) {
    assert.ok(fakeBucket.objects.has(live), `${live} is kept`);
  }
});

test('waits a day before deleting a retired version', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  await publishLirrVersion('First');
  const first = currentManifest(fakeBucket);
  await publishLirrVersion('Second');
  await publishLirrVersion('Third');
  assert.ok(fakeBucket.objects.has(first.archiveObject));
  assert.ok(fakeBucket.objects.has(first.derived.object));
});

test('never deletes content a live version uses again', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  await publishLirrVersion('First');
  const first = currentManifest(fakeBucket);
  await publishLirrVersion('Second');
  ageCurrentManifest(fakeBucket, 2);
  await publishLirrVersion('First');
  assert.equal(currentManifest(fakeBucket).archiveObject, first.archiveObject);
  assert.ok(fakeBucket.objects.has(first.archiveObject));
  assert.ok(fakeBucket.objects.has(first.derived.object));
});

test("deletes an on-demand agency's retired route files by name", async () => {
  await asOnDemandLirr(async () => {
    const fakeBucket = new FakeBucket();
    setGtfsSnapshotBucketForTests(fakeBucket);
    await publishLirrVersion('First');
    const first = currentManifest(fakeBucket);
    const firstPrefix = first.derived.routeFilesPrefix;
    assert.ok(fakeBucket.objects.has(`${firstPrefix}/stop_times/10.json`));
    await publishLirrVersion('Second');
    ageCurrentManifest(fakeBucket, 2);
    await publishLirrVersion('Third');
    const third = currentManifest(fakeBucket);
    assert.equal([...fakeBucket.objects.keys()].some((name) => name.startsWith(`${firstPrefix}/`)), false);
    assert.ok(fakeBucket.objects.has(`${third.derived.routeFilesPrefix}/stop_times/10.json`));
    assert.ok(fakeBucket.objects.has(`${third.previousDerived.routeFilesPrefix}/geometry/10.json`));
  });
});

test('rejects a manifest whose cleanup reference points outside its prepared data', () => {
  const bytes = archive(currentLirrFiles());
  const manifest = createGtfsSnapshotManifest('lirr', 'https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip', bytes, extractGtfsArchive(bytes));
  assert.throws(() => parseGtfsSnapshotManifest({ ...manifest, previousDerived: { object: 'gtfs/v1/subway/current.json' } }, 'lirr'), /previous prepared-data reference/);
  assert.throws(() => parseGtfsSnapshotManifest({ ...manifest, previousDerived: { object: `gtfs/v1/lirr/derived/${'a'.repeat(64)}-v3.zip`, routeFilesPrefix: 'gtfs/v1' } }, 'lirr'), /previous prepared-data reference/);
  assert.ok(parseGtfsSnapshotManifest({ ...manifest, previousDerived: { object: `gtfs/v1/lirr/derived/${'a'.repeat(64)}-v3.zip`, routeFilesPrefix: `gtfs/v1/lirr/derived/${'a'.repeat(64)}/3` } }, 'lirr'));
});

test('an identical feed whose Last-Modified jitters backward is unchanged, not a rollback', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const bytes = archive(currentLirrFiles());
  try {
    global.fetch = async () => new Response(bytes, { headers: { 'last-modified': 'Mon, 14 Sep 2026 15:24:18 GMT' } });
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    // NICE's server reports a second earlier on some requests.
    global.fetch = async () => new Response(bytes, { headers: { 'last-modified': 'Mon, 14 Sep 2026 15:24:17 GMT' } });
    assert.equal(await refreshGtfsSnapshot('lirr'), 'unchanged');
    assert.equal(currentManifest(fakeBucket).sourceLastModified, '2026-09-14T15:24:18.000Z');
  } finally {
    global.fetch = originalFetch;
  }
});

test('an empty optional file counts as absent (NYC Ferry ships an empty calendar_dates.txt)', () => {
  const files = { ...validFiles(), 'calendar_dates.txt': strToU8('service_id,date,exception_type\n') };
  const extracted = extractGtfsArchive(archive(files));
  assert.equal(extracted.files.has('calendar_dates.txt'), false);
  assert.ok(extracted.files.has('calendar.txt'));
  const zeroBytes = { ...validFiles(), 'shapes.txt': new Uint8Array(0) };
  assert.equal(extractGtfsArchive(archive(zeroBytes)).files.has('shapes.txt'), false);
  // A required file still may not be empty.
  assert.throws(() => extractGtfsArchive(archive({ ...validFiles(), 'routes.txt': strToU8('route_id\n') })), /routes\.txt/);
});

/** NYC DOT's Staten Island Ferry feed as it ships: byte-order marks, no direction_id or headsigns, and a never-scheduled loop trip. */
function siFerrySourceFiles() {
  const bom = '﻿';
  return {
    'routes.txt': strToU8(`${bom}route_id,agency_id,route_short_name,route_long_name,route_type,route_color\nSIF,NYC DOT,,Staten Island Ferry,4,FF8330\n`),
    'stops.txt': strToU8(`${bom}stop_id,stop_name,stop_lat,stop_lon\nstgeorge,St. George Ferry Terminal,40.644169,-74.072201\nwhitehall,Whitehall Ferry Terminal,40.70136,-74.012666\n`),
    'trips.txt': strToU8(`${bom}route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\nSIF,daily,dailystgeorge0800,,,stgeorge\nSIF,daily,dailywhitehall0830,,,whitehall\nSIF,never,neverstgeorge0900,,,stgeorge\n`),
    'stop_times.txt': strToU8(
      `${bom}trip_id,arrival_time,departure_time,stop_id,stop_sequence\n`
      + 'dailystgeorge0800,08:00:00,08:00:00,stgeorge,1\ndailystgeorge0800,08:25:00,08:25:00,whitehall,2\n'
      + 'dailywhitehall0830,08:30:00,08:30:00,whitehall,1\ndailywhitehall0830,08:55:00,08:55:00,stgeorge,2\n'
      + 'neverstgeorge0900,09:00:00,09:00:00,stgeorge,1\nneverstgeorge0900,09:25:00,09:25:00,stgeorge,2\n',
    ),
    'calendar.txt': strToU8(
      `${bom}service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n`
      + 'daily,1,1,1,1,1,1,1,20260101,20991231\nnever,0,0,0,0,0,0,0,20260101,20991231\n',
    ),
  };
}

test('fills in a feed\'s missing trip directions and headsigns, dropping trips that go nowhere', () => {
  const source = archive(siFerrySourceFiles());
  assert.throws(() => extractGtfsArchive(source), /invalid direction_id/);

  const filled = fillTripDirections(source);
  const extracted = extractGtfsArchive(filled);
  assert.equal(extracted.files.get('trips.txt').toString('utf8'), [
    'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id',
    'SIF,daily,dailystgeorge0800,Whitehall Ferry Terminal,0,stgeorge',
    'SIF,daily,dailywhitehall0830,St. George Ferry Terminal,1,whitehall',
    '',
  ].join('\n'));
  assert.doesNotMatch(extracted.files.get('stop_times.txt').toString('utf8'), /neverstgeorge0900/);
  assert.match(extracted.files.get('stop_times.txt').toString('utf8'), /dailywhitehall0830,08:55:00,08:55:00,stgeorge,2/);

  // The same source always becomes the same bytes, and a filled-in or complete feed is left alone.
  assert.deepEqual(fillTripDirections(source), filled);
  assert.deepEqual(fillTripDirections(filled), filled);
  const complete = archive();
  assert.deepEqual(fillTripDirections(complete), Buffer.from(complete));
});

test('downloads the Staten Island Ferry with a browser User-Agent and publishes it with directions filled in', async () => {
  const fakeBucket = new FakeBucket();
  setGtfsSnapshotBucketForTests(fakeBucket);
  const originalFetch = global.fetch;
  const userAgents = new Map();
  global.fetch = async (url, init = {}) => {
    const agencyId = Object.values(AGENCY_CONFIGS).find((config) => config.staticFeedUrl === String(url))?.id;
    userAgents.set(agencyId, init.headers?.['User-Agent']);
    return new Response(archive(agencyId === 'siferry' ? siFerrySourceFiles() : currentAgencyFiles(agencyId)));
  };

  try {
    assert.equal(await refreshGtfsSnapshot('siferry'), 'published');
    assert.equal(await refreshGtfsSnapshot('lirr'), 'published');
    assert.match(userAgents.get('siferry'), /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36/);
    assert.equal(userAgents.get('lirr'), 'Pathly-GTFS-Refresh/1.0');

    const manifest = JSON.parse(fakeBucket.objects.get('gtfs/v1/siferry/current.json').data.toString('utf8'));
    const published = extractGtfsArchive(fakeBucket.objects.get(manifest.archiveObject).data, { semanticValidation: false });
    assert.match(published.files.get('trips.txt').toString('utf8'), /dailystgeorge0800,Whitehall Ferry Terminal,0,/);
    // The same source again is the same snapshot.
    assert.equal(await refreshGtfsSnapshot('siferry'), 'unchanged');
  } finally {
    global.fetch = originalFetch;
  }
});
