
import type { Coordinates, LocationStatus } from '../hooks/useCurrentLocation';
import { badgeLabel, type TransitMode } from '../components/RouteBadge';
import { callable } from '../lib/firebase';
import type { SearchPlace } from './placesSearch';
import { appNow, isMockClock } from '../debug/clock';
import type { RoutePreference, TripTimeChoice } from './transit';

/** Mirrors firebase/functions/src/tripPlanning.ts — the itinerary shape planTrip returns. */
export type LatLng = { lat: number; lng: number };
export type TripMode = 'subway' | 'bus' | 'rail';
export type TripStop = { name: string; location: LatLng; time: string };
export type WalkStep = { kind: 'walk'; durationSeconds: number; distanceMeters: number; toName: string; path: LatLng[] };
export type TransitStep = {
  kind: 'transit';
  /** Google has no ferry travel mode to request, so ferry legs are only ever filtered here. */
  mode: TripMode | 'ferry' | 'other';
  agency: { name: string; url?: string };
  line: { name: string; shortName?: string; color?: string; textColor?: string; vehicleName?: string };
  headsign?: string;
  from: TripStop;
  to: TripStop;
  stopCount: number;
  durationSeconds: number;
  path: LatLng[];
  /** The stops in between, in order, when the backend matched the leg to Pathly's timetables. */
  stops?: TripStop[];
  /** That scheduled trip's GTFS trip_id (admin ID overlay). */
  tripId?: string;
};
export type TripStep = WalkStep | TransitStep;
export type TripFare = { text: string; cents: number; currency: string; estimated: boolean };
export type Itinerary = {
  id: string;
  departureTime: string;
  arrivalTime: string;
  durationSeconds: number;
  transfers: number;
  fare?: TripFare;
  steps: TripStep[];
};

type TripEndpoint = { placeId?: string; lat?: number; lng?: number; label: string };
type PlanTripRequest = {
  origin: TripEndpoint;
  destination: TripEndpoint;
  time: { mode: 'now' } | { mode: 'depart' | 'arrive'; at: string };
  preference: RoutePreference;
  modes: TripMode[];
};

export const CURRENT_LOCATION_LABEL = 'Current location';
export const TRIP_TIME_ZONE = 'America/New_York';

/** Why there are no itineraries to show (besides loading). */
export type TripPlanProblem = 'no-origin' | 'needs-place' | 'out-of-area' | 'unavailable';
export type TripPlanResult =
  | { ok: true; itineraries: Itinerary[]; fetchedAt: number }
  /** `field`: which endpoint needs choosing from search (for 'needs-place'). */
  | { ok: false; problem: TripPlanProblem; field?: 'origin' | 'destination' };

export type TripEndpoints = { origin: string; originPlace?: SearchPlace; destination: string; destinationPlace?: SearchPlace };

// ---------------------------------------------------------------------------------------------
// Time: the picker's clock time means its next occurrence in New York, wherever the device is.

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: TRIP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** New York's wall-clock time at `ms`, read as if it were UTC (so the difference is the offset). */
function nyWallAsUtc(ms: number): number {
  const parts = Object.fromEntries(wallClock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

/** The instant New York's clock shows `minutes` past midnight on the day `dayMs` falls on there. */
export function nyInstant(dayMs: number, minutes: number): number {
  const wall = new Date(nyWallAsUtc(dayMs));
  const guess = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), Math.floor(minutes / 60), minutes % 60);
  // Two passes settle the offset on either side of a DST change.
  let instant = guess - (nyWallAsUtc(guess) - guess);
  instant = guess - (nyWallAsUtc(instant) - instant);
  return instant;
}

const ONE_MINUTE_MS = 60_000;
const ONE_DAY_MS = 24 * 60 * ONE_MINUTE_MS;

/** The next time New York's clock reads `minutes` past midnight: today if still ahead, else tomorrow. */
export function nextOccurrence(minutes: number, now: Date = new Date()): { at: string; tomorrow: boolean } {
  const today = nyInstant(now.getTime(), minutes);
  if (today >= now.getTime() + ONE_MINUTE_MS) return { at: new Date(today).toISOString(), tomorrow: false };
  return { at: new Date(nyInstant(now.getTime() + ONE_DAY_MS, minutes)).toISOString(), tomorrow: true };
}

const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: TRIP_TIME_ZONE, hour: 'numeric', minute: '2-digit' });

/** "9:41 AM" in New York time. */
export function formatTripClock(iso: string): string {
  return clockFormat.format(new Date(iso)).replace(/ /g, ' ');
}

export function tripMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

// ---------------------------------------------------------------------------------------------
// Endpoints

/** A Places id we can route to (names-only and demo places have none). */
function googlePlaceId(place: SearchPlace | undefined): string | undefined {
  const id = place?.id;
  return id && !id.startsWith('name:') && /^[A-Za-z0-9_-]{16,}$/.test(id) ? id : undefined;
}

function placeLocation(place: SearchPlace | undefined): LatLng | undefined {
  const location = place?.location;
  // Saved places without coordinates are stored as [0, 0].
  return location && (location.latitude !== 0 || location.longitude !== 0) ? { lat: location.latitude, lng: location.longitude } : undefined;
}

type EndpointResult = { endpoint: TripEndpoint } | { problem: 'no-origin' | 'needs-place' };

function endpointFor(label: string, place: SearchPlace | undefined, location: Coordinates | null): EndpointResult {
  if (label === CURRENT_LOCATION_LABEL) {
    return location ? { endpoint: { label, lat: location.latitude, lng: location.longitude } } : { problem: 'no-origin' };
  }
  const usablePlace = place?.title === label ? place : undefined;
  const placeId = googlePlaceId(usablePlace);
  const point = placeLocation(usablePlace);
  if (!placeId && !point) return { problem: 'needs-place' };
  return { endpoint: { label, ...(placeId ? { placeId } : {}), ...(point ? point : {}) } };
}

/** The rider's position for "Current location", once a real fix exists. */
export function riderLocation(location: Coordinates, status: LocationStatus): Coordinates | null {
  return status === 'located' ? location : null;
}

// ---------------------------------------------------------------------------------------------
// Requests

/** What the admin's request log keeps of a plan: each trip's lines, times, and fare, not Google's content. */
export function summarizeItineraries({ itineraries }: { itineraries: Itinerary[] }) {
  return {
    count: itineraries.length,
    itineraries: itineraries.map((itinerary) => ({
      lines: itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit').map((step) => step.line.shortName ?? step.line.name),
      departureTime: itinerary.departureTime,
      arrivalTime: itinerary.arrivalTime,
      fare: itinerary.fare?.text ?? null,
    })),
  };
}

const planTripCallable = callable<PlanTripRequest, { itineraries: Itinerary[] }>('planTrip', summarizeItineraries);

const CACHE_MS = 2 * ONE_MINUTE_MS;
const cache = new Map<string, { result: TripPlanResult; at: number }>();

export type PlanTripOptions = {
  endpoints: TripEndpoints;
  location: Coordinates | null;
  time: TripTimeChoice;
  preference: RoutePreference;
  modes: readonly TripMode[];
  /** Skip the short-lived cache (the refresh control). */
  refresh?: boolean;
  now?: Date;
};

/**
 * Real itineraries for the trip criteria from the backend (Google Routes API). Results are kept
 * for two minutes in memory only, so moving between results and a trip doesn't plan (and bill)
 * again; they're never stored, since itineraries go stale and Google limits caching them.
 */
export async function planTrip({ endpoints, location, time, preference, modes, refresh = false, now = new Date(appNow()) }: PlanTripOptions): Promise<TripPlanResult> {
  const origin = endpointFor(endpoints.origin, endpoints.originPlace, location);
  if ('problem' in origin) return { ok: false, problem: origin.problem, field: 'origin' };
  const destination = endpointFor(endpoints.destination, endpoints.destinationPlace, location);
  if ('problem' in destination) return { ok: false, problem: destination.problem === 'no-origin' ? 'needs-place' : destination.problem, field: 'destination' };

  const request: PlanTripRequest = {
    origin: origin.endpoint,
    destination: destination.endpoint,
    // The backend's "now" is real, so an admin's mock time goes as an explicit departure.
    time: time.mode === 'now' ? (isMockClock() ? { mode: 'depart', at: now.toISOString() } : { mode: 'now' }) : { mode: time.mode, at: nextOccurrence(time.minutes, now).at },
    // Lowest fare and fastest sort the same results; only fewer transfers asks Google differently.
    preference: preference === 'transfers' ? 'transfers' : 'fastest',
    modes: [...modes],
  };
  const key = JSON.stringify({ ...request, minute: time.mode === 'now' ? Math.floor(now.getTime() / ONE_MINUTE_MS) : undefined });
  const cached = cache.get(key);
  if (!refresh && cached && now.getTime() - cached.at < CACHE_MS) return cached.result;

  let result: TripPlanResult;
  try {
    const { data } = await planTripCallable(request);
    result = { ok: true, itineraries: data.itineraries, fetchedAt: now.getTime() };
  } catch (error) {
    const reason = (error as { details?: { reason?: string } } | null)?.details?.reason;
    return { ok: false, problem: reason === 'out-of-area' ? 'out-of-area' : 'unavailable' };
  }
  cache.set(key, { result, at: now.getTime() });
  return result;
}

/** Test isolation only. */
/** Admin tools: forget every remembered plan, so the next one asks the backend again. */
export function clearTripPlanCache(): void {
  cache.clear();
}

export function resetTripPlanCacheForTests(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------------------------
// Ordering and filtering

const arrival = (itinerary: Itinerary) => Date.parse(itinerary.arrivalTime);

/** Itineraries in the rider's preferred order. */
export function orderItineraries(itineraries: readonly Itinerary[], preference: RoutePreference): Itinerary[] {
  const byArrival = (a: Itinerary, b: Itinerary) => arrival(a) - arrival(b);
  const sorted = [...itineraries];
  if (preference === 'transfers') return sorted.sort((a, b) => a.transfers - b.transfers || byArrival(a, b));
  if (preference === 'cheapest') {
    return sorted.sort((a, b) => (a.fare ? 0 : 1) - (b.fare ? 0 : 1) || (a.fare?.cents ?? 0) - (b.fare?.cents ?? 0) || byArrival(a, b));
  }
  return sorted.sort(byArrival);
}

/**
 * The modes to ask Google to prefer: the enabled ones it knows (it has no ferry mode). With only
 * Ferry enabled there's nothing to ask for, so every mode is asked and the app's filter decides.
 */
export function requestModes(enabled: readonly TransitMode[]): TripMode[] {
  const known = enabled.filter((mode): mode is TripMode => mode !== 'ferry');
  return known.length > 0 ? known : ['subway', 'bus', 'rail'];
}

/** Itineraries that use only enabled modes; Google treats excluded modes as a preference only. */
export function filterItinerariesByMode(itineraries: readonly Itinerary[], modes: readonly TransitMode[]): Itinerary[] {
  return itineraries.filter((itinerary) => itinerary.steps.every((step) => step.kind !== 'transit' || step.mode === 'other' || modes.includes(step.mode)));
}

export function transitSteps(itinerary: Itinerary): TransitStep[] {
  return itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit');
}

/** The fare as a card shows it: the adult one-way fare (Google's or the published fare rules'), or unknown. */
export function fareLabel(fare: TripFare | undefined): string {
  if (!fare) return 'Fare N/A';
  return fare.text;
}

const LIRR_AGENCY = 'Long Island Rail Road';

/** The badge for a trip leg: LIRR branch codes ("PJ"), "N" for Google's "N Line", "51" for bus 51. */
export function lineBadge(step: TransitStep): string {
  if (step.agency.name === LIRR_AGENCY) return badgeLabel({ agency: 'LIRR', shortName: step.line.name });
  const short = (step.line.shortName ?? '').replace(/\s+(Line|Train)$/i, '').trim();
  return badgeLabel({ agency: step.agency.name, shortName: short || step.line.name });
}

/** The badge shape for a leg's mode; other vehicles (trams, cable cars) use the bus shape. */
export function badgeMode(step: TransitStep): TransitMode {
  return step.mode === 'other' ? 'bus' : step.mode;
}
