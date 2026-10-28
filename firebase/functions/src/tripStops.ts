import { haversineMeters } from './geo';
import type { AgencyId } from './gtfsAgencies';
import {
  gtfsTimeToSeconds,
  isAgencyAvailable,
  isServiceRunningOn,
  loadAgencyStaticData,
  loadGlobalStopRouteIndex,
  loadRouteStopTimes,
  type GtfsStop,
  type GtfsStopTime,
} from './gtfsStaticData';
import { agencyIdsForStep } from './tripAgencies';
import type { TransitStep, TripDeparture, TripStop } from './tripPlanning';

/**
 * Fills in a transit leg's stops in between, which Google's Routes API doesn't give (only a
 * count), from Pathly's own timetables: the leg is matched to one scheduled trip by the stops
 * nearest its boarding and alighting points and its departure time. When the match isn't
 * clear-cut the leg gets no stops: a missing list is better than a wrong one.
 */

const STOP_RADIUS_METERS = 250;
const NEAREST_STOPS = 4;
const DEPARTURE_WINDOW_SECONDS = 120;
/** A runner-up this much closer in time than the best makes the match ambiguous. */
const CLEAR_WINNER_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * 60;
/** Other departures offered for a matched leg: from a little before it to a few hours after. */
const OPTIONS_BEFORE_SECONDS = 20 * 60;
const OPTIONS_AFTER_SECONDS = 3 * 60 * 60;
const MAX_OPTIONS = 12;
/**
 * Google times city buses with live Bus Time data, so a late or early bus can be well off its
 * scheduled minute. A bus leg with no exact match takes its stops from the nearest scheduled trip
 * within this window instead (the route's stop pattern), timed between Google's own times.
 */
const BUS_PATTERN_WINDOW_SECONDS = 20 * 60;
const TIME_ZONE = 'America/New_York';

const nyParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ServiceDay = { dateKey: string; dayOfWeek: number; /** Seconds since that day's GTFS midnight. */ seconds: number; startMs: number };

/** New York's calendar date, weekday, and seconds past midnight at `ms`. */
function newYorkClock(ms: number) {
  const parts = Object.fromEntries(nyParts.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}${parts.month}${parts.day}`,
    dayOfWeek: WEEKDAYS.indexOf(parts.weekday ?? ''),
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

/**
 * The service days a departure at `ms` can belong to: its own date, and the day before (whose
 * trips run past midnight with GTFS times of 24:00 and later). GTFS "midnight" is noon minus 12 h,
 * which keeps times right on daylight-saving days.
 */
export function serviceDaysFor(ms: number): ServiceDay[] {
  const today = newYorkClock(ms);
  const noonMs = (dateMs: number) => {
    const clock = newYorkClock(dateMs);
    return dateMs + (12 * 3600 - clock.seconds) * 1000;
  };
  const todayStart = noonMs(ms) - 12 * 3600 * 1000;
  const yesterdayNoon = noonMs(ms - DAY_SECONDS * 1000);
  const yesterday = newYorkClock(yesterdayNoon);
  const yesterdayStart = yesterdayNoon - 12 * 3600 * 1000;
  return [
    { dateKey: today.dateKey, dayOfWeek: today.dayOfWeek, seconds: Math.round((ms - todayStart) / 1000), startMs: todayStart },
    { dateKey: yesterday.dateKey, dayOfWeek: yesterday.dayOfWeek, seconds: Math.round((ms - yesterdayStart) / 1000), startMs: yesterdayStart },
  ];
}

const childrenByParent = new Map<AgencyId, Map<string, string[]>>();

function stationChildren(agencyId: AgencyId): Map<string, string[]> {
  let index = childrenByParent.get(agencyId);
  if (!index) {
    index = new Map();
    for (const stop of loadAgencyStaticData(agencyId).stopsById.values()) {
      if (!stop.parentStation) continue;
      const children = index.get(stop.parentStation);
      if (children) children.push(stop.stopId);
      else index.set(stop.parentStation, [stop.stopId]);
    }
    childrenByParent.set(agencyId, index);
  }
  return index;
}

/** The stop IDs within reach of a point: the nearest few, plus every platform of their stations. */
function candidateStops(agencyId: AgencyId, lat: number, lng: number): Set<string> {
  const { stopsById } = loadAgencyStaticData(agencyId);
  const near: { stop: GtfsStop; meters: number }[] = [];
  for (const stop of stopsById.values()) {
    const meters = haversineMeters(lat, lng, stop.lat, stop.lon);
    if (meters <= STOP_RADIUS_METERS) near.push({ stop, meters });
  }
  near.sort((a, b) => a.meters - b.meters);
  const children = stationChildren(agencyId);
  const ids = new Set<string>();
  for (const { stop } of near.slice(0, NEAREST_STOPS)) {
    const station = stop.parentStation ?? stop.stopId;
    ids.add(stop.stopId);
    ids.add(station);
    for (const child of children.get(station) ?? []) ids.add(child);
  }
  return ids;
}

/** `score`: seconds off Google's departure, with a sliver of boarding-stop distance to break ties. */
export type Candidate = {
  agencyId: AgencyId;
  tripId: string;
  between: GtfsStopTime[];
  offsetSeconds: number;
  score: number;
  startMs: number;
  /** Where the match boarded and got off (set by matchInAgency; optional for pickTrip's tests). */
  routeId?: string;
  /** Scheduled seconds (since the service day's start) at the boarding and alighting stops. */
  boardSeconds?: number;
  alightSeconds?: number;
  boardStopId?: string;
  alightStopId?: string;
};

function bySequence(a: GtfsStopTime, b: GtfsStopTime) {
  return a.stopSequence - b.stopSequence;
}

/**
 * The one scheduled trip a leg rode, or undefined when none or several fit: the best-scoring trip
 * wins only if no other is within CLEAR_WINNER_SECONDS of it, and only if its stop count agrees
 * with Google's (which counts the alighting stop) to within one.
 */
export function pickTrip(candidates: readonly Candidate[], stopCount: number): Candidate | undefined {
  // The same trip can qualify through two platforms of one station; it keeps its best boarding.
  const byTrip = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const kept = byTrip.get(candidate.tripId);
    if (!kept || candidate.score < kept.score) byTrip.set(candidate.tripId, candidate);
  }
  const [best, runnerUp] = [...byTrip.values()].sort((a, b) => a.score - b.score);
  if (!best) return undefined;
  if (runnerUp && runnerUp.offsetSeconds - best.offsetSeconds <= CLEAR_WINNER_SECONDS) return undefined;
  if (stopCount > 0 && Math.abs(best.between.length - (stopCount - 1)) > 1) return undefined;
  return best;
}

/**
 * A leg with no exact match (a bus off its timetable, or a train or ferry Google timed from live
 * data): the scheduled trip nearest Google's departure, within BUS_PATTERN_WINDOW_SECONDS, whose
 * stop count agrees with Google's, so an express isn't taken for a local. Its stops are the route's
 * stops between the two; their times are spread between Google's departure and arrival.
 */
export function pickStopPattern(candidates: readonly Candidate[], stopCount: number): Candidate | undefined {
  return [...candidates]
    .filter((candidate) => candidate.offsetSeconds <= BUS_PATTERN_WINDOW_SECONDS)
    .filter((candidate) => stopCount <= 0 || Math.abs(candidate.between.length - (stopCount - 1)) <= 1)
    .sort((a, b) => a.score - b.score)[0];
}

/**
 * The step's stops in between and its trip ID (when one scheduled trip clearly fits), or
 * undefined when none fits. A city bus is looked for in every borough feed at once; the first
 * feed (in order) with a match wins.
 */
type TripMatch = { stops: TripStop[]; tripId?: string; departures?: TripDeparture[]; live?: LiveTripRef };

/**
 * Where a matched leg's trip is found in its agency's live feed (tripLive.ts): by `tripId` when one
 * scheduled trip clearly fits, else by line, stops, and the live time nearest Google's departure.
 */
export type LiveTripRef = { agencyId: AgencyId; routeId: string; tripId?: string; boardStopId: string; alightStopId: string };

/** Each matched step's live-feed reference, kept off the step itself so it never reaches the app. */
export const liveTripRefs = new WeakMap<TransitStep, LiveTripRef>();

export async function matchTripStops(step: TransitStep): Promise<TripMatch | undefined> {
  const agencies = agencyIdsForStep(step).filter(isAgencyAvailable);
  const matches = await Promise.all(agencies.map((agencyId) => matchInAgency(agencyId, step).catch(() => undefined)));
  // A feed whose timetable gave stops beats one that only knows where to look live.
  return matches.find((match) => match !== undefined && match.stops.length > 0) ?? matches.find((match) => match !== undefined);
}

async function matchInAgency(agencyId: AgencyId, step: TransitStep): Promise<TripMatch | undefined> {
  const departureMs = Date.parse(step.from.time);
  if (Number.isNaN(departureMs)) return undefined;

  const boarding = candidateStops(agencyId, step.from.location.lat, step.from.location.lng);
  const alighting = candidateStops(agencyId, step.to.location.lat, step.to.location.lng);
  if (boarding.size === 0 || alighting.size === 0) return undefined;

  const routeIndex = await loadGlobalStopRouteIndex(agencyId);
  const routesAt = (stops: Set<string>) => new Set([...stops].flatMap((stopId) => [...(routeIndex.get(stopId) ?? [])]));
  const alightingRoutes = routesAt(alighting);
  const routeIds = [...routesAt(boarding)].filter((routeId) => alightingRoutes.has(routeId));
  if (routeIds.length === 0) return undefined;

  const { stopsById, tripsById } = loadAgencyStaticData(agencyId);
  // Neighboring stops often share a scheduled minute, so distance from Google's point decides.
  const metersFrom = (stopId: string, point: { lat: number; lng: number }) => {
    const stop = stopsById.get(stopId);
    return stop ? haversineMeters(point.lat, point.lng, stop.lat, stop.lon) : Infinity;
  };
  const days = serviceDaysFor(departureMs);
  const candidates: Candidate[] = [];
  for (const routeId of routeIds) {
    const { byStop, byTrip } = await loadRouteStopTimes(agencyId, routeId);
    for (const stopId of boarding) {
      for (const boardTime of byStop.get(stopId) ?? []) {
        const trip = tripsById.get(boardTime.tripId);
        if (!trip) continue;
        const departs = gtfsTimeToSeconds(boardTime.departureTime);
        for (const day of days) {
          const offsetSeconds = Math.abs(departs - day.seconds);
          // Every mode looks this far: an exact trip still needs DEPARTURE_WINDOW_SECONDS (below),
          // but a nearby one tells the live check which line, stops, and direction the leg rides.
          if (offsetSeconds > BUS_PATTERN_WINDOW_SECONDS) continue;
          if (!isServiceRunningOn(agencyId, trip.serviceId, day.dateKey, day.dayOfWeek)) continue;
          const sequence = [...(byTrip.get(boardTime.tripId) ?? [])].sort(bySequence);
          const alight = sequence
            .filter((time) => time.stopSequence > boardTime.stopSequence && alighting.has(time.stopId))
            .sort((a, b) => metersFrom(a.stopId, step.to.location) - metersFrom(b.stopId, step.to.location))[0];
          if (!alight) continue;
          const between = sequence.filter((time) => time.stopSequence > boardTime.stopSequence && time.stopSequence < alight.stopSequence);
          const score = offsetSeconds + metersFrom(boardTime.stopId, step.from.location) / 1000;
          candidates.push({
            agencyId,
            tripId: boardTime.tripId,
            between,
            offsetSeconds,
            score,
            startMs: day.startMs,
            routeId,
            boardStopId: boardTime.stopId,
            alightStopId: alight.stopId,
            boardSeconds: departs,
            alightSeconds: gtfsTimeToSeconds(alight.arrivalTime || alight.departureTime),
          });
        }
      }
    }
  }

  const exact = pickTrip(candidates.filter((candidate) => candidate.offsetSeconds <= DEPARTURE_WINDOW_SECONDS), step.stopCount);
  const best = exact ?? pickStopPattern(candidates, step.stopCount);
  // Google often times a leg from live data, minutes off every scheduled trip (or between two):
  // no stops then, but the nearest trip still says where the live check should look.
  const nearest = best ?? [...candidates].sort((a, b) => a.score - b.score)[0];
  const live = nearest?.routeId && nearest.boardStopId && nearest.alightStopId
    ? { agencyId, routeId: nearest.routeId, boardStopId: nearest.boardStopId, alightStopId: nearest.alightStopId, ...(exact ? { tripId: exact.tripId } : {}) }
    : undefined;
  if (!best) return live ? { stops: [], live } : undefined;

  // An exact trip keeps its scheduled times; a bus pattern's are spread between Google's times.
  const arrivalMs = Date.parse(step.to.time);
  const scheduledSpan = (best.alightSeconds ?? 0) - (best.boardSeconds ?? 0);
  const stopTime = (time: GtfsStopTime) => {
    const seconds = gtfsTimeToSeconds(time.departureTime || time.arrivalTime);
    if (exact || Number.isNaN(arrivalMs) || scheduledSpan <= 0) return new Date(best.startMs + seconds * 1000).toISOString();
    const share = (seconds - (best.boardSeconds ?? 0)) / scheduledSpan;
    return new Date(departureMs + share * (arrivalMs - departureMs)).toISOString();
  };
  const stops: TripStop[] = [];
  for (const time of best.between) {
    const stop = stopsById.get(time.stopId);
    if (!stop) return undefined;
    const parent = stop.parentStation ? stopsById.get(stop.parentStation) : undefined;
    stops.push({ name: (parent ?? stop).name, location: { lat: stop.lat, lng: stop.lon }, time: stopTime(time) });
  }
  const departures = await departureOptions(agencyId, best, departureMs);
  return { stops, ...(exact ? { tripId: exact.tripId } : {}), ...(departures.length > 1 ? { departures } : {}), ...(live ? { live } : {}) };
}

/**
 * The same line's scheduled departures from the matched boarding stop to the matched alighting
 * stop, in the same direction, from a little before the matched one to a few hours after it.
 */
async function departureOptions(agencyId: AgencyId, best: Candidate, departureMs: number): Promise<TripDeparture[]> {
  const { routeId, boardStopId, alightStopId } = best;
  if (!routeId || !boardStopId || !alightStopId) return [];
  const { tripsById } = loadAgencyStaticData(agencyId);
  const direction = tripsById.get(best.tripId)?.directionId;
  const { byStop, byTrip } = await loadRouteStopTimes(agencyId, routeId);
  const betweenStops = best.between.map((time) => time.stopId).join(',');
  const options = new Map<string, TripDeparture & { ms: number }>();
  for (const boardTime of byStop.get(boardStopId) ?? []) {
    const trip = tripsById.get(boardTime.tripId);
    if (!trip || trip.directionId !== direction) continue;
    const sequence = [...(byTrip.get(boardTime.tripId) ?? [])].sort(bySequence);
    const alight = sequence.find((time) => time.stopSequence > boardTime.stopSequence && time.stopId === alightStopId);
    if (!alight) continue;
    for (const day of serviceDaysFor(departureMs)) {
      const ms = day.startMs + gtfsTimeToSeconds(boardTime.departureTime || boardTime.arrivalTime) * 1000;
      if (ms < departureMs - OPTIONS_BEFORE_SECONDS * 1000 || ms > departureMs + OPTIONS_AFTER_SECONDS * 1000) continue;
      if (!isServiceRunningOn(agencyId, trip.serviceId, day.dateKey, day.dayOfWeek)) continue;
      const at = (time: GtfsStopTime) => new Date(day.startMs + gtfsTimeToSeconds(time.departureTime || time.arrivalTime) * 1000).toISOString();
      const between = sequence.filter((time) => time.stopSequence > boardTime.stopSequence && time.stopSequence < alight.stopSequence);
      options.set(`${boardTime.tripId}@${day.startMs}`, {
        ms,
        departs: new Date(ms).toISOString(),
        arrives: new Date(day.startMs + gtfsTimeToSeconds(alight.arrivalTime || alight.departureTime) * 1000).toISOString(),
        ...(between.map((time) => time.stopId).join(',') === betweenStops ? { stopTimes: between.map(at) } : {}),
      });
    }
  }
  const sorted = [...options.values()].sort((a, b) => a.ms - b.ms);
  // Centered on the matched departure: a couple before it, the rest after.
  const matched = sorted.findIndex((option) => Math.abs(option.ms - departureMs) <= DEPARTURE_WINDOW_SECONDS * 1000);
  const start = Math.max(0, Math.min(matched < 0 ? 0 : matched - 2, sorted.length - MAX_OPTIONS));
  return sorted.slice(start, start + MAX_OPTIONS).map(({ ms: _ms, ...option }) => option);
}

/** Adds stops in between to every transit step that matches, giving up on any not done within `budgetMs`. */
export async function addTripStops<T extends { steps: { kind: string }[] }>(itineraries: T[], budgetMs: number, match = matchTripStops): Promise<T[]> {
  const steps = itineraries.flatMap((itinerary) => itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit'));
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), budgetMs);
  });
  await Promise.all(steps.map(async (step) => {
    const result = await Promise.race([match(step).catch(() => undefined), deadline]);
    if (result && result !== 'timeout') {
      if (result.stops.length > 0) step.stops = result.stops;
      if (result.tripId) step.tripId = result.tripId;
      if (result.departures) step.departures = result.departures;
      if (result.live) liveTripRefs.set(step, result.live);
    }
  }));
  if (timer) clearTimeout(timer);
  return itineraries;
}
