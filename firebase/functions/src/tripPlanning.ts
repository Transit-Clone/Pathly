import { createHash } from 'crypto';

import { simplifyPath } from './gtfsGeometry';

/**
 * Real transit trip planning through the Google Routes API (computeRoutes, travelMode TRANSIT):
 * builds the request from the app's trip criteria and reshapes Google's response into the
 * app's own small itinerary format, so clients never parse Google's.
 */

export type TravelModeOption = 'subway' | 'bus' | 'rail';
export type TripPreference = 'fastest' | 'transfers' | 'cheapest';
export type LatLng = { lat: number; lng: number };

export type TripEndpoint = { placeId?: string; lat?: number; lng?: number; label: string };
export type PlanTripRequest = {
  origin: TripEndpoint;
  destination: TripEndpoint;
  time: { mode: 'now' } | { mode: 'depart' | 'arrive'; at: string };
  preference: TripPreference;
  modes: TravelModeOption[];
};

export type TripStop = { name: string; location: LatLng; time: string };
export type WalkStep = { kind: 'walk'; durationSeconds: number; distanceMeters: number; toName: string; path: LatLng[] };
export type TransitStep = {
  kind: 'transit';
  /** Ferry legs can't be requested or excluded at Google (it has no ferry travel mode); the app filters them. */
  mode: TravelModeOption | 'ferry' | 'other';
  agency: { name: string; url?: string };
  line: { name: string; shortName?: string; color?: string; textColor?: string; vehicleName?: string };
  headsign?: string;
  from: TripStop;
  to: TripStop;
  stopCount: number;
  durationSeconds: number;
  path: LatLng[];
  /** The stops in between, in order, when the leg matched a trip in Pathly's timetables (tripStops.ts). */
  stops?: TripStop[];
  /** That scheduled trip's GTFS trip_id (shown by the admin ID overlay). */
  tripId?: string;
  /**
   * Scheduled departures of the same line between the same two stops around this one (this one
   * included), so the rider can pick another (tripStops.ts). `stopTimes` follow `stops` when that
   * trip calls at the same stops in between.
   */
  departures?: TripDeparture[];
};
export type TripDeparture = { departs: string; arrives: string; stopTimes?: string[] };
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

export const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
/** Only what the app renders, which keeps responses small (see design.md). */
export const ROUTES_FIELD_MASK = [
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.transitDetails',
  'routes.legs.startLocation',
  'routes.legs.endLocation',
  'routes.duration',
  'routes.distanceMeters',
  'routes.travelAdvisory.transitFare',
  'routes.localizedValues.transitFare',
].join(',');

const ALL_MODES: readonly TravelModeOption[] = ['subway', 'bus', 'rail'];
const GOOGLE_MODES: Record<TravelModeOption, string[]> = { subway: ['SUBWAY', 'LIGHT_RAIL'], bus: ['BUS'], rail: ['TRAIN'] };
// Visually identical at street zoom, while keeping a four-itinerary response to tens of KB.
const PATH_SIMPLIFY_METERS = 4;
const MIN_WALK_SECONDS = 30;
const MIN_WALK_METERS = 30;

function waypoint(endpoint: TripEndpoint) {
  if (endpoint.placeId) return { placeId: endpoint.placeId };
  return { location: { latLng: { latitude: endpoint.lat, longitude: endpoint.lng } } };
}

/** The computeRoutes request body for a trip. */
export function buildRoutesRequest(request: PlanTripRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    origin: waypoint(request.origin),
    destination: waypoint(request.destination),
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: true,
    languageCode: 'en-US',
    units: 'IMPERIAL',
  };
  if (request.time.mode === 'depart') body.departureTime = request.time.at;
  if (request.time.mode === 'arrive') body.arrivalTime = request.time.at;

  // Google treats these as preferences, not filters; the app filters excluded modes itself too.
  const transitPreferences: Record<string, unknown> = {};
  const modes = ALL_MODES.filter((mode) => request.modes.includes(mode));
  if (modes.length > 0 && modes.length < ALL_MODES.length) transitPreferences.allowedTravelModes = modes.flatMap((mode) => GOOGLE_MODES[mode]);
  if (request.preference === 'transfers') transitPreferences.routingPreference = 'FEWER_TRANSFERS';
  if (Object.keys(transitPreferences).length > 0) body.transitPreferences = transitPreferences;
  return body;
}

/** Google's encoded polyline algorithm (precision 5). */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function simplified(points: readonly LatLng[]): LatLng[] {
  return simplifyPath(points.map((point) => ({ lat: point.lat, lon: point.lng })), PATH_SIMPLIFY_METERS)
    .map((point) => ({ lat: Math.round(point.lat * 1e5) / 1e5, lng: Math.round(point.lon * 1e5) / 1e5 }));
}

/** Google's vehicle types, in the app's three rider-facing modes ("other" can't be filtered out). */
export function modeForVehicle(type: string | undefined): TransitStep['mode'] {
  switch (type) {
    case 'SUBWAY': case 'METRO_RAIL': case 'LIGHT_RAIL': case 'TRAM': case 'MONORAIL':
      return 'subway';
    case 'BUS': case 'INTERCITY_BUS': case 'TROLLEYBUS':
      return 'bus';
    case 'RAIL': case 'COMMUTER_TRAIN': case 'HEAVY_RAIL': case 'HIGH_SPEED_TRAIN': case 'LONG_DISTANCE_TRAIN':
      return 'rail';
    case 'FERRY':
      return 'ferry';
    default:
      return 'other';
  }
}

type GoogleLatLng = { latLng?: { latitude?: number; longitude?: number } };
type GoogleStep = {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
  transitDetails?: {
    stopDetails?: {
      arrivalStop?: { name?: string; location?: GoogleLatLng };
      departureStop?: { name?: string; location?: GoogleLatLng };
      arrivalTime?: string;
      departureTime?: string;
    };
    headsign?: string;
    stopCount?: number;
    transitLine?: {
      agencies?: { name?: string; uri?: string }[];
      name?: string;
      nameShort?: string;
      color?: string;
      textColor?: string;
      vehicle?: { name?: { text?: string }; type?: string };
    };
  };
};
type GoogleMoney = { currencyCode?: string; units?: string; nanos?: number };
type GoogleRoute = {
  legs?: { steps?: GoogleStep[]; startLocation?: GoogleLatLng; endLocation?: GoogleLatLng }[];
  travelAdvisory?: { transitFare?: GoogleMoney };
  localizedValues?: { transitFare?: { text?: string } };
};
export type RoutesResponse = { routes?: GoogleRoute[] };

/** A fare for the whole itinerary when Google can't price every step; see tripFares.ts. */
export type FareEstimator = (steps: readonly TransitStep[], departureTime: string) => TripFare | undefined;

const seconds = (duration: string | undefined) => Number.parseFloat(duration ?? '0') || 0;
const toLatLng = (location: GoogleLatLng | undefined): LatLng => ({ lat: location?.latLng?.latitude ?? 0, lng: location?.latLng?.longitude ?? 0 });
const addSeconds = (iso: string, delta: number) => new Date(Date.parse(iso) + delta * 1000).toISOString();

function googleFare(route: GoogleRoute): TripFare | undefined {
  const money = route.travelAdvisory?.transitFare;
  if (!money?.currencyCode) return undefined;
  const cents = Math.round(Number(money.units ?? 0) * 100 + (money.nanos ?? 0) / 1e7);
  const text = route.localizedValues?.transitFare?.text || `$${(cents / 100).toFixed(2)}`;
  return { text, cents, currency: money.currencyCode, estimated: false };
}

function transitStep(step: GoogleStep): TransitStep {
  const details = step.transitDetails!;
  const stops = details.stopDetails ?? {};
  const line = details.transitLine ?? {};
  const agency = line.agencies?.[0];
  const departure = stops.departureTime ?? '';
  const arrival = stops.arrivalTime ?? '';
  return {
    kind: 'transit',
    mode: modeForVehicle(line.vehicle?.type),
    agency: { name: agency?.name ?? 'Transit', ...(agency?.uri ? { url: agency.uri } : {}) },
    line: {
      name: line.name ?? line.nameShort ?? 'Transit',
      ...(line.nameShort ? { shortName: line.nameShort } : {}),
      ...(line.color ? { color: line.color } : {}),
      ...(line.textColor ? { textColor: line.textColor } : {}),
      ...(line.vehicle?.name?.text ? { vehicleName: line.vehicle.name.text } : {}),
    },
    ...(details.headsign ? { headsign: details.headsign } : {}),
    from: { name: stops.departureStop?.name ?? '', location: toLatLng(stops.departureStop?.location), time: departure },
    to: { name: stops.arrivalStop?.name ?? '', location: toLatLng(stops.arrivalStop?.location), time: arrival },
    stopCount: details.stopCount ?? 0,
    durationSeconds: Math.max(0, (Date.parse(arrival) - Date.parse(departure)) / 1000) || seconds(step.staticDuration),
    path: simplified(decodePolyline(step.polyline?.encodedPolyline ?? '')),
  };
}

/** One route: consecutive walking instructions merge into one walk, named for where it leads. */
function normalizeRoute(route: GoogleRoute, requestTime: string, destinationLabel: string, estimateFare?: FareEstimator): Itinerary | null {
  const googleSteps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []);
  if (googleSteps.length === 0) return null;

  const steps: TripStep[] = [];
  let walk: { durationSeconds: number; distanceMeters: number; path: LatLng[] } | null = null;
  const flushWalk = (toName: string) => {
    if (!walk) return;
    // Changing buses at the same stop shows up as a few seconds of "walking"; it isn't a step.
    if (walk.durationSeconds < MIN_WALK_SECONDS && walk.distanceMeters < MIN_WALK_METERS) {
      walk = null;
      return;
    }
    steps.push({ kind: 'walk', durationSeconds: Math.round(walk.durationSeconds), distanceMeters: Math.round(walk.distanceMeters), toName, path: simplified(walk.path) });
    walk = null;
  };
  for (const step of googleSteps) {
    if (step.transitDetails) {
      const transit = transitStep(step);
      flushWalk(transit.from.name);
      steps.push(transit);
      continue;
    }
    walk ??= { durationSeconds: 0, distanceMeters: 0, path: [] };
    walk.durationSeconds += seconds(step.staticDuration);
    walk.distanceMeters += step.distanceMeters ?? 0;
    walk.path.push(...decodePolyline(step.polyline?.encodedPolyline ?? ''));
  }
  flushWalk(destinationLabel);

  const transits = steps.filter((step): step is TransitStep => step.kind === 'transit');
  const firstTransit = steps.findIndex((step) => step.kind === 'transit');
  let departureTime: string;
  let arrivalTime: string;
  if (firstTransit < 0) {
    // Walking only: it starts when asked.
    departureTime = requestTime;
    arrivalTime = addSeconds(requestTime, steps.reduce((sum, step) => sum + step.durationSeconds, 0));
  } else {
    // Google's route duration counts from the request time, overstating a trip whose first
    // vehicle leaves later; the trip really starts with the walk to that vehicle.
    const walkBefore = steps.slice(0, firstTransit).reduce((sum, step) => sum + step.durationSeconds, 0);
    const lastTransit = steps.length - 1 - [...steps].reverse().findIndex((step) => step.kind === 'transit');
    const walkAfter = steps.slice(lastTransit + 1).reduce((sum, step) => sum + step.durationSeconds, 0);
    departureTime = addSeconds(transits[0]!.from.time, -walkBefore);
    arrivalTime = addSeconds(transits.at(-1)!.to.time, walkAfter);
  }

  const key = transits.length === 0 ? 'walk' : transits.map((step) => `${step.line.name}|${step.from.name}|${step.from.time}`).join('>');
  const fare = googleFare(route) ?? estimateFare?.(transits, departureTime);
  return {
    id: createHash('sha256').update(key).digest('hex').slice(0, 12),
    departureTime,
    arrivalTime,
    durationSeconds: Math.round((Date.parse(arrivalTime) - Date.parse(departureTime)) / 1000),
    transfers: Math.max(0, transits.length - 1),
    ...(fare ? { fare } : {}),
    steps,
  };
}

/** Google's routes as app itineraries, in Google's order, with repeated trips dropped. */
export function normalizeRoutesResponse(
  response: RoutesResponse,
  requestTime: string,
  destinationLabel: string,
  estimateFare?: FareEstimator,
): Itinerary[] {
  const seen = new Set<string>();
  const itineraries: Itinerary[] = [];
  for (const route of response.routes ?? []) {
    const itinerary = normalizeRoute(route, requestTime, destinationLabel, estimateFare);
    if (!itinerary || seen.has(itinerary.id)) continue;
    seen.add(itinerary.id);
    itineraries.push(itinerary);
  }
  return itineraries;
}
