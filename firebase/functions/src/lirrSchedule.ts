import { loadLirrStaticData } from './lirrStaticData';
import type { LirrTripStatus } from './lirrStatus';

export type DirectionPrediction = { minutes: number; live: boolean };

export type StopPredictions = {
  /** direction_id 1. */
  towardDirection1: readonly DirectionPrediction[];
  /** direction_id 0. */
  towardDirection0: readonly DirectionPrediction[];
};

const EASTERN_TIME_ZONE = 'America/New_York';
const PREDICTIONS_PER_DIRECTION = 3;

function easternNowParts(): { dateKey: string; secondsSinceMidnight: number } {
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
  return {
    dateKey: `${parts.year}${parts.month}${parts.day}`,
    secondsSinceMidnight: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

/** GTFS times are "HH:MM:SS" and can exceed 24:00:00 for a post-midnight trip of the same service day. */
function gtfsTimeToSeconds(hms: string): number {
  const parts = hms.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

/**
 * Upcoming departures for one stop, by direction — real-time trips first (from the GTFS-RT
 * feed, already resolved into `trips`), padded with the actual published static timetable
 * (stop_times.txt + calendar_dates.txt, since LIRR publishes service exclusively via date
 * exceptions) whenever real-time has nothing upcoming for that direction. This is what makes
 * the predictions always real: previously, a direction with no live trip fell back to a
 * fabricated placeholder number instead of the real schedule. Static-only entries are marked
 * `live: false`, same as how MTA TrainTime distinguishes GPS-tracked from scheduled trips.
 */
export function getStopPredictions(routeId: string, stopId: string, trips: readonly LirrTripStatus[]): StopPredictions {
  const liveByDirection = new Map<number, { tripId: string; minutes: number }[]>();
  const now = Date.now();

  for (const trip of trips) {
    const stop = trip.stops.find((candidate) => candidate.stopId === stopId);
    if (!stop?.scheduledTime) continue;
    const minutes = Math.round((new Date(stop.scheduledTime).getTime() - now) / 60_000);
    if (minutes < 0) continue;

    const bucket = liveByDirection.get(trip.directionId) ?? [];
    bucket.push({ tripId: trip.tripId, minutes });
    liveByDirection.set(trip.directionId, bucket);
  }

  const seenTripIds = new Set([...liveByDirection.values()].flat().map((entry) => entry.tripId));

  const { stopTimesByStop, tripsById, serviceDatesByService } = loadLirrStaticData();
  const { dateKey, secondsSinceMidnight } = easternNowParts();
  const staticByDirection = new Map<number, { tripId: string; minutes: number }[]>();

  for (const stopTime of stopTimesByStop.get(stopId) ?? []) {
    if (seenTripIds.has(stopTime.tripId)) continue;
    const trip = tripsById.get(stopTime.tripId);
    if (!trip || trip.routeId !== routeId) continue;
    if (!serviceDatesByService.get(trip.serviceId)?.has(dateKey)) continue;

    const eventSeconds = gtfsTimeToSeconds(stopTime.departureTime || stopTime.arrivalTime);
    const minutes = Math.round((eventSeconds - secondsSinceMidnight) / 60);
    if (minutes < 0) continue;

    const bucket = staticByDirection.get(trip.directionId) ?? [];
    bucket.push({ tripId: stopTime.tripId, minutes });
    staticByDirection.set(trip.directionId, bucket);
  }

  const mergeDirection = (directionId: number): DirectionPrediction[] => {
    const merged: DirectionPrediction[] = [
      ...(liveByDirection.get(directionId) ?? []).map((entry) => ({ minutes: entry.minutes, live: true })),
      ...(staticByDirection.get(directionId) ?? []).map((entry) => ({ minutes: entry.minutes, live: false })),
    ];
    merged.sort((a, b) => a.minutes - b.minutes);
    return merged.slice(0, PREDICTIONS_PER_DIRECTION);
  };

  return { towardDirection1: mergeDirection(1), towardDirection0: mergeDirection(0) };
}
