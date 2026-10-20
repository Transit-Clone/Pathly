#!/usr/bin/env node
/**
 * Prepares each agency's timetable for fast cold starts under static_data/<agency>/derived/ (the
 * layout is described in src/gtfsDerivedBuild.ts, which the daily snapshot refresh also uses), so
 * src/gtfsStaticData.ts reads a few small files instead of scanning the whole feed.
 *
 * Usage (after `npm run build`, which compiles the builder this runs):
 *   node scripts/build-gtfs-index.js           build agencies whose output is missing or stale
 *   node scripts/build-gtfs-index.js --force   rebuild every agency
 *   node scripts/build-gtfs-index.js --check   build nothing; exit 1 if any agency is missing or stale
 */
const fs = require('fs');
const path = require('path');

const { AGENCY_CONFIGS } = require('../lib/gtfsAgencies');
const { DERIVED_DIR, DERIVED_VERSION, MANIFEST_FILE, derivedSources } = require('../lib/gtfsDerived');
const { buildDerivedData } = require('../lib/gtfsDerivedBuild');

const STATIC_DATA_ROOT = path.join(__dirname, '../static_data');

/** True when `dir`'s manifest matches the current source files. */
function isCurrent(dataDir) {
  const manifestPath = path.join(dataDir, DERIVED_DIR, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return manifest.version === DERIVED_VERSION && JSON.stringify(manifest.sources) === JSON.stringify(derivedSources(dataDir));
  } catch {
    return false;
  }
}

/**
 * Renames the finished output into place. Windows can briefly lock just-written folders
 * (antivirus, search indexer), so the rename is retried, then falls back to a copy.
 */
async function moveIntoPlace(from, to) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  fs.cpSync(from, to, { recursive: true });
  fs.rmSync(from, { recursive: true, force: true });
}

async function buildAgency(agencyId, dataDir) {
  // Written to a temporary directory and swapped in, so a failed run never leaves half an index.
  const derivedDir = path.join(dataDir, DERIVED_DIR);
  const tempDir = `${derivedDir}.tmp-${process.pid}`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  try {
    const counts = await buildDerivedData(agencyId, dataDir, tempDir);
    fs.rmSync(derivedDir, { recursive: true, force: true });
    await moveIntoPlace(tempDir, derivedDir);
    return counts;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const force = process.argv.includes('--force');
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [agencyId, config] of Object.entries(AGENCY_CONFIGS)) {
    const dataDir = path.join(STATIC_DATA_ROOT, config.dataDir);
    if (check) {
      if (!isCurrent(dataDir)) stale.push(agencyId);
      continue;
    }
    if (!force && isCurrent(dataDir)) {
      console.log(`${agencyId}: up to date`);
      continue;
    }
    const started = Date.now();
    const { routes, stops } = await buildAgency(agencyId, dataDir);
    console.log(`${agencyId}: ${routes} routes, ${stops} stops in ${Date.now() - started} ms`);
  }
  if (check && stale.length > 0) {
    console.error(`Timetable indexes missing or out of date for: ${stale.join(', ')}. Run \`npm run build:gtfs\` in firebase/functions.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
