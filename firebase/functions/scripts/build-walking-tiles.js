#!/usr/bin/env node
/**
 * Builds the pedestrian street graph Nearby uses to pick the stop closest on foot (see
 * src/walkingGraph.ts) from an OpenStreetMap extract, into static_data/walking/, which is
 * bundled with the deploy. Streets change slowly; rebuild every month or two.
 *
 * Usage (after `npm run build`, which compiles the tile writer this runs):
 *   1. Download https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf (~500 MB)
 *      somewhere outside the repo.
 *   2. node --max-old-space-size=6144 scripts/build-walking-tiles.js <path-to>/new-york-latest.osm.pbf
 *   node scripts/build-walking-tiles.js --check   build nothing; exit 1 if the tiles are missing or
 *                                                 incomplete (run before every deploy)
 *
 * The tiles are gitignored, so a fresh checkout has none until step 2 runs. Without them Nearby
 * still works but quietly falls back to straight-line distance, which is why deploys check.
 *
 * Reads the file twice: first the walkable ways (which nodes they use), then those nodes'
 * coordinates. Keeps only the service area, joins ways at shared nodes, drops points along a
 * street that aren't intersections (keeping one every ~50 m so a stop mid-block snaps nearby),
 * and drops tiny disconnected pieces a stop could snap onto by mistake.
 *
 * Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
 */
const fs = require('fs');
const path = require('path');

const { haversineMeters } = require('../lib/geo');
const { SERVICE_AREA_BOUNDS } = require('../lib/serviceArea');
const { WALKING_FORMAT_VERSION, WALKING_TILE_DEGREES } = require('../lib/walkingGraph');
const { writeWalkingTiles } = require('../lib/walkingTilesBuild');

const OUT_DIR = path.join(__dirname, '../static_data/walking');
const MAX_EDGE_METERS = 50;
const MIN_COMPONENT_NODES = 25;

// Ways a person can walk along. Motorways are left out; so is anything tagged as closed to people on foot.
const WALKABLE_HIGHWAYS = new Set([
  'footway', 'path', 'pedestrian', 'steps', 'living_street', 'residential', 'service', 'unclassified', 'road',
  'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'trunk', 'trunk_link',
  'track', 'cycleway', 'bridleway', 'corridor', 'crossing', 'elevator',
]);
const FOOT_ALLOWED = new Set(['yes', 'designated', 'permissive', 'official']);

function isWalkable(tags) {
  if (!tags || !WALKABLE_HIGHWAYS.has(tags.highway)) return false;
  if (tags.foot && FOOT_ALLOWED.has(tags.foot)) return true;
  // use_sidepath: walk on the separately mapped sidewalk instead, which is its own way.
  if (tags.foot === 'no' || tags.foot === 'private' || tags.foot === 'use_sidepath') return false;
  if (tags.access === 'no' || tags.access === 'private') return false;
  if (tags.highway === 'trunk' || tags.highway === 'trunk_link') return tags.sidewalk !== undefined && tags.sidewalk !== 'no' && tags.sidewalk !== 'none';
  return true;
}

/** A growable Float64Array. */
class Float64List {
  constructor() { this.data = new Float64Array(1 << 20); this.length = 0; }
  push(value) {
    if (this.length === this.data.length) {
      const next = new Float64Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
  view() { return this.data.subarray(0, this.length); }
}

/** Why the bundled tiles can't be used, or null when they're all there in the current format. */
function checkTiles() {
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return `${manifestPath} is missing`;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    return `${manifestPath} is unreadable: ${error.message}`;
  }
  if (manifest.version !== WALKING_FORMAT_VERSION || manifest.tileDegrees !== WALKING_TILE_DEGREES) return 'tiles are in an older format';
  if (!Array.isArray(manifest.tiles) || manifest.tiles.length === 0) return 'the manifest lists no tiles';
  const missing = manifest.tiles.filter((key) => !fs.existsSync(path.join(OUT_DIR, `${key}.bin.gz`)));
  if (missing.length > 0) return `${missing.length} of ${manifest.tiles.length} tiles are missing (e.g. ${missing[0]})`;
  return null;
}

async function main() {
  if (process.argv[2] === '--check') {
    const problem = checkTiles();
    if (problem) {
      console.error(`Walking tiles are not ready: ${problem}.`);
      console.error('Build them first (see scripts/build-walking-tiles.js): npm --prefix firebase/functions run build:walking -- <new-york-latest.osm.pbf>');
      process.exit(1);
    }
    console.log('Walking tiles are ready.');
    return;
  }
  const source = process.argv[2];
  if (!source || !fs.existsSync(source)) {
    console.error('Usage: node --max-old-space-size=6144 scripts/build-walking-tiles.js <new-york-latest.osm.pbf>');
    process.exit(2);
  }
  const { OSMTransform } = await import('osm-pbf-parser-node');
  // Whole blocks at a time: tens of millions of entities read one by one would be far slower.
  const blocks = (options) => fs.createReadStream(source).pipe(new OSMTransform(options));

  // Pass 1: walkable ways, as runs of node ids (wayStarts[i]..wayStarts[i + 1] in wayRefs).
  console.log('Reading walkable ways...');
  const wayRefs = new Float64List();
  const wayStarts = [0];
  for await (const block of blocks({ withTags: { way: ['highway', 'foot', 'access', 'sidewalk'], node: false, relation: false }, withInfo: false })) {
    for (const item of block) {
      if (item.type !== 'way' || !isWalkable(item.tags)) continue;
      for (const ref of item.refs) wayRefs.push(ref);
      wayStarts.push(wayRefs.length);
    }
  }
  const refs = wayRefs.view();
  console.log(`  ${wayStarts.length - 1} ways, ${refs.length} node references`);

  // The distinct nodes those ways use, sorted, so pass 2 can find each by binary search.
  const needed = Float64Array.from(new Set(refs)).sort();
  const lat = new Float64Array(needed.length).fill(NaN);
  const lon = new Float64Array(needed.length).fill(NaN);
  const indexOf = (id) => {
    let low = 0;
    let high = needed.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (needed[mid] === id) return mid;
      if (needed[mid] < id) low = mid + 1;
      else high = mid - 1;
    }
    return -1;
  };

  // Pass 2: those nodes' coordinates, inside the service area only.
  console.log(`Reading ${needed.length} node positions...`);
  const { north, south, east, west } = SERVICE_AREA_BOUNDS;
  reading: for await (const block of blocks({ withTags: false, withInfo: false })) {
    for (const item of block) {
      if (item.type === 'way') break reading; // Nodes come first in a sorted extract.
      if (item.type !== 'node') continue;
      if (item.lat < south || item.lat > north || item.lon < west || item.lon > east) continue;
      const index = indexOf(item.id);
      if (index >= 0) {
        lat[index] = item.lat;
        lon[index] = item.lon;
      }
    }
  }

  // Graph nodes: way ends and nodes shared by several ways (intersections).
  const uses = new Uint8Array(needed.length);
  const refIndex = new Int32Array(refs.length);
  for (let i = 0; i < refs.length; i += 1) {
    const index = indexOf(refs[i]);
    refIndex[i] = index;
    if (uses[index] < 255) uses[index] += 1;
  }
  const graphIndex = new Int32Array(needed.length).fill(-1);
  const nodes = [];
  const edges = [];
  const nodeFor = (index) => {
    if (graphIndex[index] < 0) {
      graphIndex[index] = nodes.length;
      nodes.push({ lat: lat[index], lon: lon[index] });
    }
    return graphIndex[index];
  };
  for (let way = 0; way + 1 < wayStarts.length; way += 1) {
    let from = -1;
    let meters = 0;
    for (let i = wayStarts[way]; i < wayStarts[way + 1]; i += 1) {
      const index = refIndex[i];
      if (Number.isNaN(lat[index])) {
        // Outside the service area: the way is cut here.
        from = -1;
        continue;
      }
      if (from < 0) {
        from = index;
        meters = 0;
        continue;
      }
      const previous = refIndex[i - 1];
      meters += haversineMeters(lat[previous], lon[previous], lat[index], lon[index]);
      const isEnd = i + 1 === wayStarts[way + 1] || Number.isNaN(lat[refIndex[i + 1]]);
      if (isEnd || uses[index] > 1 || meters >= MAX_EDGE_METERS) {
        edges.push({ a: nodeFor(from), b: nodeFor(index), meters });
        from = index;
        meters = 0;
      }
    }
  }
  console.log(`  ${nodes.length} graph nodes, ${edges.length} edges`);

  // Drop small disconnected pieces (a mapped path in a courtyard, a lone driveway).
  const parent = Int32Array.from({ length: nodes.length }, (_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]];
    return index;
  };
  for (const edge of edges) parent[find(edge.a)] = find(edge.b);
  const componentSize = new Int32Array(nodes.length);
  for (let index = 0; index < nodes.length; index += 1) componentSize[find(index)] += 1;
  const keptIndex = new Int32Array(nodes.length).fill(-1);
  const keptNodes = [];
  nodes.forEach((node, index) => {
    if (componentSize[find(index)] >= MIN_COMPONENT_NODES) {
      keptIndex[index] = keptNodes.length;
      keptNodes.push(node);
    }
  });
  const keptEdges = edges.filter((edge) => keptIndex[edge.a] >= 0).map((edge) => ({ a: keptIndex[edge.a], b: keptIndex[edge.b], meters: edge.meters }));

  const result = writeWalkingTiles(OUT_DIR, keptNodes, keptEdges, { source: `${path.basename(source)} (OpenStreetMap contributors, ODbL)` });
  console.log(`Wrote ${result.tiles} tiles (${result.nodes} nodes, ${result.edges} edges, ${(result.bytes / 1e6).toFixed(1)} MB) to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
