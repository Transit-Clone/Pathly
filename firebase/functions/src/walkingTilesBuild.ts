import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  encodeWalkingTile,
  globalNodeId,
  tileKey,
  tileXY,
  WALKING_FORMAT_VERSION,
  WALKING_TILE_DEGREES,
  type WalkingManifest,
} from './walkingGraph';

/** A walkable connection between nodes `a` and `b` (indexes into the node list), both ways. */
export type WalkingEdge = { a: number; b: number; meters: number };

/**
 * Cuts a walking graph into walkingGraph.ts's tiles and writes them, with manifest.json, to
 * `dir`, replacing any tiles already there. Used by scripts/build-walking-tiles.js and tests.
 */
export function writeWalkingTiles(
  dir: string,
  nodes: readonly { lat: number; lon: number }[],
  edges: readonly WalkingEdge[],
  meta: { source?: string } = {},
): { tiles: number; nodes: number; edges: number; bytes: number } {
  // Each node's home tile and index there.
  const globalId = new Float64Array(nodes.length);
  const tileNodes = new Map<string, number[]>();
  nodes.forEach((node, index) => {
    const [x, y] = tileXY(node.lat, node.lon);
    const key = tileKey(x, y);
    let list = tileNodes.get(key);
    if (!list) tileNodes.set(key, (list = []));
    globalId[index] = globalNodeId(x, y, list.length);
    list.push(index);
  });

  const adjacency: { to: number; meters: number }[][] = nodes.map(() => []);
  for (const edge of edges) {
    if (edge.a === edge.b) continue;
    const meters = Math.max(1, Math.min(65_535, Math.round(edge.meters)));
    adjacency[edge.a]!.push({ to: edge.b, meters });
    adjacency[edge.b]!.push({ to: edge.a, meters });
  }

  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.bin.gz') || name === 'manifest.json') rmSync(join(dir, name));
  }
  let bytes = 0;
  for (const [key, members] of tileNodes) {
    const edgeCount = members.reduce((sum, index) => sum + adjacency[index]!.length, 0);
    const tile = {
      lat: new Int32Array(members.length),
      lon: new Int32Array(members.length),
      edgeStart: new Uint32Array(members.length + 1),
      edgeTarget: new Float64Array(edgeCount),
      edgeMeters: new Uint16Array(edgeCount),
    };
    let edge = 0;
    members.forEach((index, local) => {
      tile.lat[local] = Math.round(nodes[index]!.lat * 1e6);
      tile.lon[local] = Math.round(nodes[index]!.lon * 1e6);
      tile.edgeStart[local] = edge;
      for (const { to, meters } of adjacency[index]!) {
        tile.edgeTarget[edge] = globalId[to]!;
        tile.edgeMeters[edge] = meters;
        edge += 1;
      }
    });
    tile.edgeStart[members.length] = edge;
    const encoded = encodeWalkingTile(tile);
    bytes += encoded.length;
    writeFileSync(join(dir, `${key}.bin.gz`), encoded);
  }
  const manifest: WalkingManifest = {
    version: WALKING_FORMAT_VERSION,
    tileDegrees: WALKING_TILE_DEGREES,
    tiles: [...tileNodes.keys()].sort(),
    ...(meta.source ? { source: meta.source } : {}),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  return { tiles: tileNodes.size, nodes: nodes.length, edges: edges.length, bytes };
}
