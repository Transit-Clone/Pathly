import { agencyConfig, type AgencyId } from './gtfsAgencies';
import { gtfsTimeToSeconds, isServiceRunningOn, loadAgencyStaticData, loadRouteStopTimes } from './gtfsStaticData';
import type { GtfsTripStatus } from './gtfsStatus';

export type DirectionPrediction = {
  minutes: number;
  live: boolean;
  /** This specific trip's real LIRR peak/off-peak classification — null for agencies without fare tiers (e.g. subway's flat fare) or if it couldn't be resolved. */
  peakOffpeak: boolean | null;
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

type Entry = { tripId: string; minutes: number; peakOffpeak: boolean | null };

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
  const direction1Live: Entry[] = [];
  const direction0Live: Entry[] = [];

  for (const trip of trips) {
    if (config.directionalStops) {
      const stop = trip.stops.find((candidate) => candidate.stopId === direction1StopId || candidate.stopId === direction0StopId);
      if (!stop?.scheduledTime) continue;
      const minutes = Math.round((new Date(stop.scheduledTime).getTime() - now) / 60_000);
      if (minutes < 0) continue;
      // Terminals can serve both directions from one stop_id; the trip's own direction decides then.
      const isDirection1 = direction1StopId === direction0StopId ? trip.directionId === 1 : stop.stopId === direction1StopId;
      (isDirection1 ? direction1Live : direction0Live).push({ tripId: trip.tripId, minutes, peakOffpeak: trip.peakOffpeak });
    } else {
      const stop = trip.stops.find((candidate) => candidate.stopId === direction1StopId);
      if (!stop?.scheduledTime) continue;
      const minutes = Math.round((new Date(stop.scheduledTime).getTime() - now) / 60_000);
      if (minutes < 0) continue;
      (trip.directionId === 1 ? direction1Live : direction0Live).push({ tripId: trip.tripId, minutes, peakOffpeak: trip.peakOffpeak });
    }
  }

  // The published timetable pads live predictions for every agency, today and (when today
  // has too few left) the next service day, so each direction can show a few departures even
  // with one or no vehicle tracked.
  const direction1Static: Entry[] = [];
  const direction0Static: Entry[] = [];
  const seenTripIds = new Set([...direction1Live, ...direction0Live].map((entry) => entry.tripId));
  const { tripsById } = loadAgencyStaticData(agencyId);
  const { byStop } = await loadRouteStopTimes(agencyId, routeId);
  const nowParts = easternNowParts();
  // Directional-stop agencies have one stop_id per direction; otherwise one shared stop_id
  // (direction1StopId === direction0StopId) and the trip's direction_id decides.
  const stopIds = config.directionalStops ? [...new Set([direction1StopId, direction0StopId])] : [direction1StopId];

  const collectStatic = (day: ServiceDay, dayOffsetSeconds: number) => {
    for (const stopId of stopIds) {
      for (const stopTime of byStop.get(stopId) ?? []) {
        if (config.realtimeTripIdsMatchStatic && seenTripIds.has(stopTime.tripId)) continue;
        const trip = tripsById.get(stopTime.tripId);
        if (!trip || trip.routeId !== routeId) continue;
        if (!isServiceRunningOn(agencyId, trip.serviceId, day.dateKey, day.dayOfWeek)) continue;

        const eventSeconds = gtfsTimeToSeconds(stopTime.departureTime || stopTime.arrivalTime) + dayOffsetSeconds;
        const minutes = Math.round((eventSeconds - nowParts.secondsSinceMidnight) / 60);
        if (minutes < 0) continue;

        const isDirection1 = config.directionalStops && direction1StopId !== direction0StopId ? stopId === direction1StopId : trip.directionId === 1;
        (isDirection1 ? direction1Static : direction0Static).push({ tripId: stopTime.tripId, minutes, peakOffpeak: trip.peakOffpeak });
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
      ...live.map((entry) => ({ minutes: entry.minutes, live: true, peakOffpeak: entry.peakOffpeak })),
      ...padding.map((entry) => ({ minutes: entry.minutes, live: false, peakOffpeak: entry.peakOffpeak })),
    ];
    merged.sort((a, b) => a.minutes - b.minutes);
    return merged.slice(0, limit);
  };

  return {
    towardDirection1: merge(direction1Live, direction1Static),
    towardDirection0: merge(direction0Live, direction0Static),
  };
}
