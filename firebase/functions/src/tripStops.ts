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
import type { TransitStep, TripStop } from './tripPlanning';

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
export type Candidate = { agencyId: AgencyId; tripId: string; between: GtfsStopTime[]; offsetSeconds: number; score: number; startMs: number };

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
 * The step's stops in between and its trip ID, or undefined when no single trip clearly fits. A
 * city bus is looked for in each borough feed in turn; the first clear match wins.
 */
export async function matchTripStops(step: TransitStep): Promise<{ stops: TripStop[]; tripId: string } | undefined> {
  for (const agencyId of agencyIdsForStep(step).filter(isAgencyAvailable)) {
    const match = await matchInAgency(agencyId, step);
    if (match) return match;
  }
  return undefined;
}

async function matchInAgency(agencyId: AgencyId, step: TransitStep): Promise<{ stops: TripStop[]; tripId: string } | undefined> {
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
          if (offsetSeconds > DEPARTURE_WINDOW_SECONDS) continue;
          if (!isServiceRunningOn(agencyId, trip.serviceId, day.dateKey, day.dayOfWeek)) continue;
          const sequence = [...(byTrip.get(boardTime.tripId) ?? [])].sort(bySequence);
          const alight = sequence
            .filter((time) => time.stopSequence > boardTime.stopSequence && alighting.has(time.stopId))
            .sort((a, b) => metersFrom(a.stopId, step.to.location) - metersFrom(b.stopId, step.to.location))[0];
          if (!alight) continue;
          const between = sequence.filter((time) => time.stopSequence > boardTime.stopSequence && time.stopSequence < alight.stopSequence);
          const score = offsetSeconds + metersFrom(boardTime.stopId, step.from.location) / 1000;
          candidates.push({ agencyId, tripId: boardTime.tripId, between, offsetSeconds, score, startMs: day.startMs });
        }
      }
    }
  }

  const best = pickTrip(candidates, step.stopCount);
  if (!best) return undefined;

  const stops: TripStop[] = [];
  for (const time of best.between) {
    const stop = stopsById.get(time.stopId);
    if (!stop) return undefined;
    const parent = stop.parentStation ? stopsById.get(stop.parentStation) : undefined;
    stops.push({
      name: (parent ?? stop).name,
      location: { lat: stop.lat, lng: stop.lon },
      time: new Date(best.startMs + gtfsTimeToSeconds(time.departureTime || time.arrivalTime) * 1000).toISOString(),
    });
  }
  return { stops, tripId: best.tripId };
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
      step.stops = result.stops;
      step.tripId = result.tripId;
    }
  }));
  if (timer) clearTimeout(timer);
  return itineraries;
}
