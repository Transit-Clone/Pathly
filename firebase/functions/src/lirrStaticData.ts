import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

// static_data lives inside functions/ (not a sibling) specifically so a real `firebase
// deploy` — which only uploads the function's own source directory — includes it. See
// firebase.json's functions.source.
const DATA_DIR = join(__dirname, '../static_data/lirr');

function loadCsv<T>(filename: string): T[] {
  const raw = readFileSync(join(DATA_DIR, filename), 'utf-8');
  return parse(raw, { columns: true }) as T[];
}

type RouteRow = { route_id: string; route_long_name: string; route_color: string };
type StopRow = { stop_id: string; stop_name: string; stop_lat: string; stop_lon: string };
type TripRow = { trip_id: string; route_id: string; trip_headsign: string; direction_id: string; service_id: string };
type StopTimeRow = { trip_id: string; arrival_time: string; departure_time: string; stop_id: string; stop_sequence: string };
type CalendarDateRow = { service_id: string; date: string; exception_type: string };

export type LirrStop = { stopId: string; name: string; lat: number; lon: number };
export type LirrTrip = { tripId: string; routeId: string; headsign: string; directionId: number; serviceId: string };
export type LirrRoute = { routeId: string; name: string; color: string };
/** One scheduled stop event from stop_times.txt — arrival/departure are "HH:MM:SS" local time, can exceed 24:00:00 for a post-midnight trip of the same service day. */
export type LirrStopTime = { tripId: string; arrivalTime: string; departureTime: string; stopSequence: number };

type LirrStaticData = {
  routesById: Map<string, LirrRoute>;
  stopsById: Map<string, LirrStop>;
  tripsById: Map<string, LirrTrip>;
  /** stop_times.txt rows grouped by stop_id, for finding every trip that calls at a given stop. */
  stopTimesByStop: Map<string, LirrStopTime[]>;
  /** service_id -> the set of "YYYYMMDD" dates it actually runs (LIRR publishes service exclusively via calendar_dates.txt exceptions, no calendar.txt). */
  serviceDatesByService: Map<string, Set<string>>;
};

let cached: LirrStaticData | null = null;

/** Loads and indexes the LIRR static GTFS reference data; cached after first call. */
export function loadLirrStaticData(): LirrStaticData {
  if (cached) return cached;

  const routesById = new Map<string, LirrRoute>();
  for (const row of loadCsv<RouteRow>('routes.txt')) {
    routesById.set(row.route_id, { routeId: row.route_id, name: row.route_long_name, color: row.route_color });
  }

  const stopsById = new Map<string, LirrStop>();
  for (const row of loadCsv<StopRow>('stops.txt')) {
    stopsById.set(row.stop_id, { stopId: row.stop_id, name: row.stop_name, lat: Number(row.stop_lat), lon: Number(row.stop_lon) });
  }

  const tripsById = new Map<string, LirrTrip>();
  for (const row of loadCsv<TripRow>('trips.txt')) {
    tripsById.set(row.trip_id, {
      tripId: row.trip_id,
      routeId: row.route_id,
      headsign: row.trip_headsign,
      directionId: Number(row.direction_id),
      serviceId: row.service_id,
    });
  }

  const stopTimesByStop = new Map<string, LirrStopTime[]>();
  for (const row of loadCsv<StopTimeRow>('stop_times.txt')) {
    const entry: LirrStopTime = {
      tripId: row.trip_id,
      arrivalTime: row.arrival_time,
      departureTime: row.departure_time,
      stopSequence: Number(row.stop_sequence),
    };
    const existing = stopTimesByStop.get(row.stop_id);
    if (existing) existing.push(entry);
    else stopTimesByStop.set(row.stop_id, [entry]);
  }

  const serviceDatesByService = new Map<string, Set<string>>();
  for (const row of loadCsv<CalendarDateRow>('calendar_dates.txt')) {
    if (row.exception_type !== '1') continue;
    const dates = serviceDatesByService.get(row.service_id);
    if (dates) dates.add(row.date);
    else serviceDatesByService.set(row.service_id, new Set([row.date]));
  }

  cached = { routesById, stopsById, tripsById, stopTimesByStop, serviceDatesByService };
  return cached;
}
