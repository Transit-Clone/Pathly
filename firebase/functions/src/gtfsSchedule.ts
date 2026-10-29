import { agencyConfig, type AgencyId } from './gtfsAgencies';
import { gtfsTimeToSeconds, isServiceRunningOn, loadAgencyStaticData, loadRouteStopTimes } from './gtfsStaticData';
import type { GtfsTripStatus } from './gtfsStatus';

export type DirectionPrediction = {
  minutes: number;
  live: boolean;
  /** This specific trip's real LIRR peak/off-peak classification — null for agencies without fare tiers (e.g. subway's flat fare) or if it couldn't be resolved. */
  peakOffpeak: boolean | null;
  /**
   * How many minutes behind (negative: ahead of) its timetable a tracked trip is running at this
   * stop: the feed's own delay, or else its live time against trips.txt where the agency's live
   * trip_ids match the timetable's. Null for a timetable departure, or when it can't be told.
   */
  delayMinutes: number | null;
  /**
   * Where this trip ends: its timetable headsign, or else the last stop the live feed lists for
   * it. A direction's trips don't all go as far (an S76 short-turning at Clove Rd), so each
   * departure says its own. Null when neither is known.
   */
  headsign: string | null;
};
export type StopPredictions = {
  towardDirection1: readonly DirectionPrediction[];
  towardDirection0: readonly DirectionPrediction[];
};

const EASTERN_TIME_ZONE = 'America/New_York';
/** Tiles shown per direction on route detail (and the minimum the next-day lookahead aims for). */
const PREDICTIONS_PER_DIRECTION = 6;

type ServiceDay = { dateKey: string; dayOfWeek: number };

function easternNowParts(): { dateKey: string; secondsSinceMidnight: number; dayOfWeek: number; tomorrow: ServiceDay } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    dateKey: `${parts.year}${parts.month}${parts.day}`,
    secondsSinceMidnight: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
    // Computed from the Eastern calendar date via Date.UTC (not `new Date().getDay()`, which
    // would use the server's own timezone — wrong near a UTC/Eastern midnight boundary).
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    tomorrow: serviceDayAt(new Date(Date.UTC(year, month - 1, day + 1))),
  };
}

function serviceDayAt(utcDate: Date): ServiceDay {
  const dateKey = `${utcDate.getUTCFullYear()}${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}${String(utcDate.getUTCDate()).padStart(2, '0')}`;
  return { dateKey, dayOfWeek: utcDate.getUTCDay() };
}

type Entry = { tripId: string; minutes: number; peakOffpeak: boolean | null; delayMinutes: number | null; headsign: string | null };
/** A tracked trip at the asked-for stop, before its delay is resolved. */
type LiveEntry = Entry & { stopId: string; atMs: number };

/** Beyond this, a live time and a timetable time are taken to belong to different runs of the trip. */
const MAX_PLAUSIBLE_DELAY_MINUTES = 180;

const feedDelayMinutes = (delaySeconds: number | null) => (delaySeconds == null ? null : Math.round(delaySeconds / 60));

/**
 * Upcoming departures for one station, by direction — works the same way for any configured
 * agency, with two behaviors that switch on gtfsAgencies.ts's per-agency flags:
 *
 * Direction is read by matching *which* of `direction1StopId`/`direction0StopId` a trip hits
 * when `directionalStops` is set (NYC Subway: direction_id is unreliable there, but each
 * direction has its own stop_id); otherwise by the trip's own direction_id, looked up against
 * `direction1StopId` for both directions (LIRR-style: one stop_id serves a station regardless
 * of direction, so direction1StopId === direction0StopId is expected and correct there).
 *
 * Live predictions are padded with the real published timetable (never a placeholder) for
 * every agency, looking into the next service day when today has too few departures left.
 * Where realtime and static trip_ids match (`realtimeTripIdsMatchStatic`), a tracked trip's
 * timetable entry is dropped by id; otherwise only timetable departures after the last live
 * one are added (see gtfsAgencies.ts).
 */
export async function getStopPredictions(
  agencyId: AgencyId,
  routeId: string,
  direction1StopId: string,
  direction0StopId: string,
  trips: readonly GtfsTripStatus[],
  /** How many departures to return per direction; the full departures list asks for many more. */
  limit = PREDICTIONS_PER_DIRECTION,
): Promise<StopPredictions> {
  const config = agencyConfig(agencyId);
  const now = Date.now();
  const { tripsById, stopsById } = loadAgencyStaticData(agencyId);
  const liveHeadsign = (trip: GtfsTripStatus): string | null => {
    const timetable = tripsById.get(trip.tripId)?.headsign;
    if (timetable) return timetable;
    const lastStopId = trip.stops.at(-1)?.stopId;
    return (lastStopId && stopsById.get(lastStopId)?.name) || null;
  };
  const direction1Live: LiveEntry[] = [];
  const direction0Live: LiveEntry[] = [];

  for (const trip of trips) {
    if (config.directionalStops) {
      const stop = trip.stops.find((candidate) => candidate.stopId === direction1StopId || candidate.stopId === direction0StopId);
      if (!stop?.scheduledTime) continue;
      const atMs = new Date(stop.scheduledTime).getTime();
      const minutes = Math.round((atMs - now) / 60_000);
      if (minutes < 0) continue;
      // Terminals can serve both directions from one stop_id; the trip's own direction decides then.
      const isDirection1 = direction1StopId === direction0StopId ? trip.directionId === 1 : stop.stopId === direction1StopId;
      (isDirection1 ? direction1Live : direction0Live).push({ tripId: trip.tripId, minutes, peakOffpeak: trip.peakOffpeak, delayMinutes: feedDelayMinutes(stop.delaySeconds), headsign: liveHeadsign(trip), stopId: stop.stopId, atMs });
    } else {
      const stop = trip.stops.find((candidate) => candidate.stopId === direction1StopId);
      if (!stop?.scheduledTime) continue;
      const atMs = new Date(stop.scheduledTime).getTime();
      const minutes = Math.round((atMs - now) / 60_000);
      if (minutes < 0) continue;
      (trip.directionId === 1 ? direction1Live : direction0Live).push({ tripId: trip.tripId, minutes, peakOffpeak: trip.peakOffpeak, delayMinutes: feedDelayMinutes(stop.delaySeconds), headsign: liveHeadsign(trip), stopId: stop.stopId, atMs });
    }
  }

  // The published timetable pads live predictions for every agency, today and (when today
  // has too few left) the next service day, so each direction can show a few departures even
  // with one or no vehicle tracked.
  const direction1Static: Entry[] = [];
  const direction0Static: Entry[] = [];
  const seenTripIds = new Set([...direction1Live, ...direction0Live].map((entry) => entry.tripId));
  const { byStop, byTrip } = await loadRouteStopTimes(agencyId, routeId);
  // A shuttle's trip ends at the other terminal: arriving there isn't a departure from it.
  const endsTripHere = (stopTime: { tripId: string; stopSequence: number }) => config.terminalShuttle === true
    && (byTrip.get(stopTime.tripId) ?? []).every((other) => other.stopSequence <= stopTime.stopSequence);
  const nowParts = easternNowParts();

  // A tracked trip the feed gives no delay for is compared with its own timetable time at the stop,
  // when the live trip_ids are the timetable's. The trip may have started yesterday (a time past
  // 24:00:00), so the nearer of today's and yesterday's service day is taken.
  if (config.realtimeTripIdsMatchStatic) {
    const midnightMs = now - nowParts.secondsSinceMidnight * 1000;
    for (const entry of [...direction1Live, ...direction0Live]) {
      if (entry.delayMinutes !== null) continue;
      const stopTime = (byStop.get(entry.stopId) ?? []).find((candidate) => candidate.tripId === entry.tripId);
      if (!stopTime) continue;
      const scheduledSeconds = gtfsTimeToSeconds(stopTime.departureTime || stopTime.arrivalTime);
      const delays = [0, 1].map((daysBack) => Math.round((entry.atMs - (midnightMs + (scheduledSeconds - daysBack * 86_400) * 1000)) / 60_000));
      const delay = delays.reduce((best, candidate) => (Math.abs(candidate) < Math.abs(best) ? candidate : best));
      if (Math.abs(delay) <= MAX_PLAUSIBLE_DELAY_MINUTES) entry.delayMinutes = delay;
    }
  }
  // Directional-stop agencies have one stop_id per direction; otherwise one shared stop_id
  // (direction1StopId === direction0StopId) and the trip's direction_id decides.
  const stopIds = config.directionalStops ? [...new Set([direction1StopId, direction0StopId])] : [direction1StopId];

  const collectStatic = (day: ServiceDay, dayOffsetSeconds: number) => {
    for (const stopId of stopIds) {
      for (const stopTime of byStop.get(stopId) ?? []) {
        if (config.realtimeTripIdsMatchStatic && seenTripIds.has(stopTime.tripId)) continue;
        const trip = tripsById.get(stopTime.tripId);
        if (!trip || trip.routeId !== routeId) continue;
        if (endsTripHere(stopTime)) continue;
        if (!isServiceRunningOn(agencyId, trip.serviceId, day.dateKey, day.dayOfWeek)) continue;

        const eventSeconds = gtfsTimeToSeconds(stopTime.departureTime || stopTime.arrivalTime) + dayOffsetSeconds;
        const minutes = Math.round((eventSeconds - nowParts.secondsSinceMidnight) / 60);
        if (minutes < 0) continue;

        const isDirection1 = config.directionalStops && direction1StopId !== direction0StopId ? stopId === direction1StopId : trip.directionId === 1;
        (isDirection1 ? direction1Static : direction0Static).push({ tripId: stopTime.tripId, minutes, peakOffpeak: trip.peakOffpeak, delayMinutes: null, headsign: trip.headsign || null });
      }
    }
  };

  collectStatic(nowParts, 0);
  const needsMore = (live: Entry[], staticEntries: Entry[]) => live.length + staticEntries.length < Math.min(limit, PREDICTIONS_PER_DIRECTION);
  if (needsMore(direction1Live, direction1Static) || needsMore(direction0Live, direction0Static)) {
    collectStatic(nowParts.tomorrow, 24 * 3600);
  }

  const merge = (live: Entry[], staticEntries: Entry[]): DirectionPrediction[] => {
    // Without matching trip_ids, a tracked trip's own timetable entry can't be identified, so
    // only timetable departures after the last live one are added (never the same trip twice).
    const lastLive = Math.max(-1, ...live.map((entry) => entry.minutes));
    const padding = config.realtimeTripIdsMatchStatic ? staticEntries : staticEntries.filter((entry) => entry.minutes > lastLive);
    const merged: DirectionPrediction[] = [
      ...live.map((entry) => ({ minutes: entry.minutes, live: true, peakOffpeak: entry.peakOffpeak, delayMinutes: entry.delayMinutes, headsign: entry.headsign })),
      ...padding.map((entry) => ({ minutes: entry.minutes, live: false, peakOffpeak: entry.peakOffpeak, delayMinutes: null, headsign: entry.headsign })),
    ];
    merged.sort((a, b) => a.minutes - b.minutes);
    return merged.slice(0, limit);
  };

  return {
    towardDirection1: merge(direction1Live, direction1Static),
    towardDirection0: merge(direction0Live, direction0Static),
  };
}
