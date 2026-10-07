const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const LIB = path.join(__dirname, '../lib');
const STATIC_DATA = path.join(__dirname, '../static_data');
const AGENCIES = { lirr: 'lirr', subway: 'subway', nice: 'nice', suffolk: 'suffolk' };
const SAMPLED_ROUTES_PER_AGENCY = 5;

/** A fresh copy of the loaders, reading prepared files or (disabled) scanning the CSVs. */
function freshLoaders(useDerived) {
  for (const id of Object.keys(require.cache)) if (id.startsWith(LIB)) delete require.cache[id];
  if (useDerived) delete process.env.GTFS_DERIVED_DISABLED;
  else process.env.GTFS_DERIVED_DISABLED = '1';
  return require(path.join(LIB, 'gtfsStaticData'));
}

/** Every LIRR route, and each other agency's busiest routes (largest prepared files) plus one small one. */
function sampleRoutes(agencyId) {
  const dir = path.join(STATIC_DATA, AGENCIES[agencyId], 'derived/stop_times');
  const files = fs.readdirSync(dir).map((file) => ({ routeId: decodeURIComponent(file.replace(/\.json$/, '')), size: fs.statSync(path.join(dir, file)).size }));
  files.sort((a, b) => b.size - a.size);
  if (agencyId === 'lirr') return files.map((file) => file.routeId);
  return [...files.slice(0, SAMPLED_ROUTES_PER_AGENCY - 1), files[files.length - 1]].map((file) => file.routeId);
}

/** Map<stopId, Set<routeId>> as plain arrays, keeping each stop's route order. */
const indexEntries = (index) => [...index].map(([stopId, routes]) => [stopId, [...routes]]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

test.after(() => {
  delete process.env.GTFS_DERIVED_DISABLED;
});

for (const agencyId of Object.keys(AGENCIES)) {
  test(`${agencyId}: prepared timetable files match scanning stop_times.txt`, async () => {
    const manifest = path.join(STATIC_DATA, AGENCIES[agencyId], 'derived/manifest.json');
    assert.ok(fs.existsSync(manifest), `run \`npm run build:gtfs\` first (missing ${manifest})`);
    const routeIds = [...sampleRoutes(agencyId), 'no-such-route'];

    // The prepared side must never open stop_times.txt (otherwise both sides would just scan).
    const originalCreateReadStream = fs.createReadStream;
    let stopTimesScans = 0;
    fs.createReadStream = function (file, ...rest) {
      if (String(file).endsWith('stop_times.txt')) stopTimesScans += 1;
      return originalCreateReadStream.call(this, file, ...rest);
    };
    let preparedIndex;
    let preparedRoutes;
    let preparedCounts;
    try {
      const prepared = freshLoaders(true);
      preparedIndex = indexEntries(await prepared.loadGlobalStopRouteIndex(agencyId));
      preparedRoutes = await Promise.all(routeIds.map((routeId) => prepared.loadRouteStopTimes(agencyId, routeId)));
      preparedCounts = await Promise.all(routeIds.map((routeId) => prepared.loadRouteStopCounts(agencyId, routeId)));
    } finally {
      fs.createReadStream = originalCreateReadStream;
    }
    assert.equal(stopTimesScans, 0);

    const scanned = freshLoaders(false);
    const scannedIndex = indexEntries(await scanned.loadGlobalStopRouteIndex(agencyId));
    const scannedRoutes = await Promise.all(routeIds.map((routeId) => scanned.loadRouteStopTimes(agencyId, routeId)));
    const scannedCounts = await Promise.all(routeIds.map((routeId) => scanned.loadRouteStopCounts(agencyId, routeId)));

    assert.deepStrictEqual(preparedIndex, scannedIndex);
    routeIds.forEach((routeId, index) => {
      assert.deepStrictEqual(preparedRoutes[index], scannedRoutes[index], `${agencyId} route ${routeId}`);
      // Entry order matters (it breaks ties in nearest-stop selection), so compare as ordered lists.
      for (const direction of [0, 1]) {
        assert.deepStrictEqual([...preparedCounts[index][direction]], [...scannedCounts[index][direction]], `${agencyId} route ${routeId} direction ${direction} stop counts`);
      }
    });
    assert.ok(preparedRoutes[0].byTrip.size > 0, 'the busiest sampled route has trips');
  });
}
