import type { LatLng } from './tripPlanning';
import rows from './subwayEntrances.json';

type EntranceRow = [complexId: number, lat: number, lng: number, type: string, access: 'both' | 'entry' | 'exit'];
export type SubwayEntrance = { point: LatLng; label: string };

const ENTRANCES = rows as EntranceRow[];
/** Google's stop point lies within this of its station's nearest entrance. */
const STATION_MATCH_METERS = 300;
/** The farthest entrance of one station complex worth showing, so a long complex shows only the rider's end. */
const STATION_REACH_METERS = 450;

/** Equirectangular: entrances are compared over a few hundred meters, and this runs over every row. */
function metersBetween(lat: number, lng: number, point: LatLng): number {
  const x = (lng - point.lng) * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(x, lat - point.lat) * 111_320;
}

const TYPE_LABELS: Record<string, string> = {
  'Easement - Passage': 'Passageway',
  'Easement - Street': 'Street entrance',
  'Station House': 'Station house',
};

function entranceLabel(type: string, access: EntranceRow[4]): string {
  const name = TYPE_LABELS[type] ?? type.replaceAll('/', ' or ');
  if (access === 'exit') return `${name} · Exit only`;
  if (access === 'entry') return `${name} · Entrance only`;
  return name;
}

/** Every way in and out of the subway station at `point`, or none when no station is there. */
export function subwayEntrancesAt(point: LatLng): SubwayEntrance[] {
  let nearest: EntranceRow | undefined;
  let nearestMeters = STATION_MATCH_METERS;
  for (const row of ENTRANCES) {
    const meters = metersBetween(row[1], row[2], point);
    if (meters <= nearestMeters) {
      nearest = row;
      nearestMeters = meters;
    }
  }
  if (!nearest) return [];
  const complexId = nearest[0];
  return ENTRANCES
    .filter((row) => row[0] === complexId && metersBetween(row[1], row[2], point) <= STATION_REACH_METERS)
    .map((row) => ({ point: { lat: row[1], lng: row[2] }, label: entranceLabel(row[3], row[4]) }));
}
