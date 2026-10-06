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
const PREDICTIONS_PER_DIRECTION = 3;

function easternNowParts(): { dateKey: string; secondsSinceMidnight: number; dayOfWeek: number } {
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
  };
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
 * Padding live with the real published timetable when live has nothing upcoming (never a
 * placeholder) only happens when `supportsStaticFallback` is set — it needs the realtime
 * feed's trip_ids to match the static schedule's, which isn't true for every agency (see
 * gtfsAgencies.ts).
 */
export async function getStopPredictions(
  agencyId: AgencyId,
  routeId: string,
  direction1StopId: string,
  direction0StopId: string,
  trips: readonly GtfsTripStatus[],
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
      (stop.stopId === direction1StopId ? direction1Live : direction0Live).push({ tripId: trip.tripId, minutes, peakOffpeak: trip.peakOffpeak });
    } else {
      const stop = trip.stops.find((candidate) => candidate.stopId === direction1StopId);
      if (!stop?.scheduledTime) continue;
      const minutes = Math.round((new Date(stop.scheduledTime).getTime() - now) / 60_000);
      if (minutes < 0) continue;
      (trip.directionId === 1 ? direction1Live : direction0Live).push({ tripId: trip.tripId, minutes, peakOffpeak: trip.peakOffpeak });
    }
  }

  let direction1Static: Entry[] = [];
  let direction0Static: Entry[] = [];

  if (config.supportsStaticFallback) {
    const seenTripIds = new Set([...direction1Live, ...direction0Live].map((entry) => entry.tripId));
    const { tripsById } = loadAgencyStaticData(agencyId);
    const { byStop } = await loadRouteStopTimes(agencyId, routeId);
    const { dateKey, secondsSinceMidnight, dayOfWeek } = easternNowParts();

    // direction1StopId === direction0StopId here (non-directional-stop agencies), so this
    // single lookup already covers both directions' static schedule.
    for (const stopTime of byStop.get(direction1StopId) ?? []) {
      if (seenTripIds.has(stopTime.tripId)) continue;
      const trip = tripsById.get(stopTime.tripId);
      if (!trip || trip.routeId !== routeId) continue;
      if (!isServiceRunningOn(agencyId, trip.serviceId, dateKey, dayOfWeek)) continue;

      const eventSeconds = gtfsTimeToSeconds(stopTime.departureTime || stopTime.arrivalTime);
      const minutes = Math.round((eventSeconds - secondsSinceMidnight) / 60);
      if (minutes < 0) continue;

      (trip.directionId === 1 ? direction1Static : direction0Static).push({ tripId: stopTime.tripId, minutes, peakOffpeak: trip.peakOffpeak });
    }
  }

  const merge = (live: Entry[], staticEntries: Entry[]): DirectionPrediction[] => {
    const merged: DirectionPrediction[] = [
      ...live.map((entry) => ({ minutes: entry.minutes, live: true, peakOffpeak: entry.peakOffpeak })),
      ...staticEntries.map((entry) => ({ minutes: entry.minutes, live: false, peakOffpeak: entry.peakOffpeak })),
    ];
    merged.sort((a, b) => a.minutes - b.minutes);
    return merged.slice(0, PREDICTIONS_PER_DIRECTION);
  };

  return {
    towardDirection1: merge(direction1Live, direction1Static),
    towardDirection0: merge(direction0Live, direction0Static),
  };
}
