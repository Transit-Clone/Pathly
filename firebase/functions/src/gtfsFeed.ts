import { parse as parseSync } from 'csv-parse/sync';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { displayTransitName } from './transitNames';

/**
 * Pure readers for one agency's GTFS files in a given directory, shared by the request-time
 * loaders (gtfsStaticData.ts, which add per-instance caching and pick the active directory) and
 * the prepared-data builder (gtfsDerivedBuild.ts, which runs on a deploy's or a snapshot's files).
 */

/**
 * GTFS times are "HH:MM:SS" and can exceed 24:00:00 for a post-midnight trip of the same
 * service day.
 */
export function gtfsTimeToSeconds(hms: string): number {
  const parts = hms.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

export function readCsv<T>(dataDir: string, filename: string): T[] {
  const path = join(dataDir, filename);
  if (!existsSync(path)) return [];
  return parseSync(readFileSync(path, 'utf-8'), { bom: true, columns: true }) as T[];
}

type RouteRow = { route_id: string; route_short_name: string; route_long_name: string; route_color: string };
type StopRow = { stop_id: string; stop_name: string; stop_lat: string; stop_lon: string; parent_station?: string };
type TripRow = { trip_id: string; route_id: string; trip_headsign: string; direction_id: string; service_id: string; peak_offpeak?: string; shape_id?: string };
type ShapeRow = { shape_id: string; shape_pt_lat: string; shape_pt_lon: string; shape_pt_sequence: string };
export type StopTimeRow = { trip_id: string; stop_id: string; arrival_time: string; departure_time: string; stop_sequence: string };
type CalendarRow = {
  service_id: string;
  monday: string; tuesday: string; wednesday: string; thursday: string; friday: string; saturday: string; sunday: string;
  start_date: string; end_date: string;
};
type CalendarDateRow = { service_id: string; date: string; exception_type: string };

export type GtfsStop = { stopId: string; name: string; lat: number; lon: number; parentStation: string | null };
/** `peakOffpeak` is LIRR's own real schedule classification (trips.txt's peak_offpeak column) — null for agencies whose trips.txt doesn't have that column (e.g. subway, which doesn't have peak/off-peak fares at all). */
export type GtfsTrip = { tripId: string; routeId: string; headsign: string; directionId: number; serviceId: string; peakOffpeak: boolean | null; shapeId: string | null };
export type ShapePoint = { lat: number; lon: number };
export type GtfsRoute = { routeId: string; shortName: string; name: string; color: string };
/** One scheduled stop event from stop_times.txt — arrival/departure are "HH:MM:SS" local time, can exceed 24:00:00 for a post-midnight trip of the same service day. */
export type GtfsStopTime = { tripId: string; stopId: string; arrivalTime: string; departureTime: string; stopSequence: number };
/** A service_id's weekly pattern and the date range it's valid for — absent for agencies (like LIRR) that publish service exclusively via calendar_dates.txt exceptions. */
export type GtfsCalendar = { daysOfWeek: readonly boolean[]; startDate: string; endDate: string };

export type AgencyStaticData = {
  routesById: Map<string, GtfsRoute>;
  stopsById: Map<string, GtfsStop>;
  tripsById: Map<string, GtfsTrip>;
  calendarByService: Map<string, GtfsCalendar>;
  /** service_id -> "YYYYMMDD" dates added (exception_type 1) or removed (exception_type 2) on top of the weekly pattern (or, for calendar.txt-less agencies, the *entire* schedule). */
  calendarExceptionsByService: Map<string, Map<string, '1' | '2'>>;
};

/** An agency's small-to-medium files (not stop_times.txt or shapes.txt), indexed. */
export function readAgencyStaticData(dataDir: string): AgencyStaticData {
  const routesById = new Map<string, GtfsRoute>();
  for (const row of readCsv<RouteRow>(dataDir, 'routes.txt')) {
    // LIRR's routes.txt has no route_short_name column at all (not just blank) — fall all the
    // way back to the route_id itself rather than leaving this undefined.
    const shortName = row.route_short_name || row.route_long_name || row.route_id;
    routesById.set(row.route_id, { routeId: row.route_id, shortName, name: row.route_long_name || shortName, color: row.route_color });
  }

  const stopsById = new Map<string, GtfsStop>();
  for (const row of readCsv<StopRow>(dataDir, 'stops.txt')) {
    stopsById.set(row.stop_id, {
      stopId: row.stop_id,
      // MTA's city buses publish names in all caps; riders see them recased.
      name: displayTransitName(row.stop_name),
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
      parentStation: row.parent_station || null,
    });
  }

  const tripsById = new Map<string, GtfsTrip>();
  for (const row of readCsv<TripRow>(dataDir, 'trips.txt')) {
    tripsById.set(row.trip_id, {
      tripId: row.trip_id,
      routeId: row.route_id,
      headsign: displayTransitName(row.trip_headsign),
      directionId: Number(row.direction_id),
      serviceId: row.service_id,
      peakOffpeak: row.peak_offpeak === undefined ? null : row.peak_offpeak === '1',
      shapeId: row.shape_id || null,
    });
  }

  const calendarByService = new Map<string, GtfsCalendar>();
  for (const row of readCsv<CalendarRow>(dataDir, 'calendar.txt')) {
    calendarByService.set(row.service_id, {
      daysOfWeek: [row.sunday, row.monday, row.tuesday, row.wednesday, row.thursday, row.friday, row.saturday].map((v) => v === '1'),
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }

  const calendarExceptionsByService = new Map<string, Map<string, '1' | '2'>>();
  for (const row of readCsv<CalendarDateRow>(dataDir, 'calendar_dates.txt')) {
    const exceptions = calendarExceptionsByService.get(row.service_id) ?? new Map<string, '1' | '2'>();
    exceptions.set(row.date, row.exception_type === '2' ? '2' : '1');
    calendarExceptionsByService.set(row.service_id, exceptions);
  }

  return { routesById, stopsById, tripsById, calendarByService, calendarExceptionsByService };
}

/** shape_id -> ordered points from shapes.txt (several MB for some agencies). */
export function readShapes(dataDir: string): Map<string, ShapePoint[]> {
  const withSequence = new Map<string, { sequence: number; point: ShapePoint }[]>();
  for (const row of readCsv<ShapeRow>(dataDir, 'shapes.txt')) {
    const list = withSequence.get(row.shape_id) ?? [];
    list.push({ sequence: Number(row.shape_pt_sequence), point: { lat: Number(row.shape_pt_lat), lon: Number(row.shape_pt_lon) } });
    withSequence.set(row.shape_id, list);
  }
  const shapes = new Map<string, ShapePoint[]>();
  for (const [shapeId, list] of withSequence) shapes.set(shapeId, list.sort((a, b) => a.sequence - b.sequence).map((entry) => entry.point));
  return shapes;
}
