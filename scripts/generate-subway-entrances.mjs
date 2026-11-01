// Writes mobile/src/data/subwayEntrances.json from the MTA's "Subway Entrances and Exits" open data.
// Run from the repo root when stations change: node scripts/generate-subway-entrances.mjs
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://data.ny.gov/resource/i9wp-a4ja.json?$limit=10000&$order=complex_id,entrance_latitude';

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Entrance data request failed with status ${response.status}`);
const rows = await response.json();

// [complex id, lat, lng, type, 'both' | 'entry' | 'exit'], with exact duplicates dropped.
const entrances = [...new Set(rows.map((row) => JSON.stringify([
  Number(row.complex_id),
  Number(row.entrance_latitude),
  Number(row.entrance_longitude),
  row.entrance_type,
  row.exit_allowed !== 'YES' ? 'entry' : row.entry_allowed !== 'YES' ? 'exit' : 'both',
])))];
writeFileSync(new URL('../mobile/src/data/subwayEntrances.json', import.meta.url), `[\n${entrances.join(',\n')}\n]\n`);
console.log(`Wrote ${entrances.length} entrances`);
