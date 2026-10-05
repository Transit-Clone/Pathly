import type { Point } from './mapGeometry';

export type RouteId = 'ronkonkoma' | 's1' | 'e' | '51' | '7';

export const routeColors: Record<RouteId, string> = {
  ronkonkoma: '#a625a9',
  s1: '#d6173f',
  e: '#0139a6',
  '51': '#ff0011',
  '7': '#a625a9',
};

export type TransitDirection = {
  direction: string;
  live: boolean;
  minutes: number;
  stopName: string;
};

export type RoutePrediction = {
  live: boolean;
  minutes: number;
};

export function minuteLabel(minutes: number): string {
  return minutes === 1 ? 'minute' : 'minutes';
}

export type RouteStop = {
  name: string;
  /** Minutes after the route's first stop — real GTFS hop durations for the LIRR branch, approximate for the mock bus/subway routes. */
  offsetMinutes: number;
};

export type RouteDetail = {
  agency: string;
  alert: string;
  color: string;
  destination: string;
  direction: string;
  directions: readonly [TransitDirection, TransitDirection];
  id: RouteId;
  /**
   * The real LIRR route_id/stop_id to poll for live data, and which `directions` index
   * corresponds to GTFS direction_id 1 (the other index is implicitly direction_id 0). Omit
   * for routes with no live feed (everything except the Port Jefferson Branch, for now) — see
   * routes.txt/stops.txt in firebase/functions/static_data/lirr for valid IDs.
   */
  liveSource?: { routeId: string; stopId: string; direction1Index: 0 | 1 };
  mapLabels: readonly string[];
  /** Route line in map world coordinates. */
  mapPath: readonly Point[];
  /** Index into `mapPath` for each entry of `mapLabels`. */
  mapStops: readonly number[];
  predictions: readonly RoutePrediction[];
  /** Real live predictions for the reverse direction (directions[1]), when a live feed has any; falls back to a synthetic estimate otherwise. */
  reversePredictions?: readonly RoutePrediction[];
  routeName: string;
  shortName: string;
  stops: readonly RouteStop[];
  /** Which `directions` index `stops` is authored in chronological (departs-first) order for — the other direction's "Route stops" list is shown reversed, re-anchored from its own end. Defaults to 0. */
  stopsDirectionIndex?: 0 | 1;
};

export const routes: readonly RouteDetail[] = [
  {
    // Internal key only (used for pins/favorites/tests) — the real branch is Port
    // Jefferson, not Ronkonkoma; see firebase/functions/static_data/lirr/routes.txt.
    id: 'ronkonkoma',
    agency: 'LIRR',
    shortName: 'PJ',
    routeName: 'Port Jefferson Branch',
    color: routeColors.ronkonkoma,
    direction: 'Westbound',
    destination: 'Penn Station',
    // route_id "10", stop_id "14" (Stony Brook); direction_id 1 = toward Penn Station = directions[0].
    liveSource: { routeId: '10', stopId: '14', direction1Index: 0 },
    directions: [
      { direction: 'Westbound to Penn Station', stopName: 'Stony Brook Station', minutes: 18, live: true },
      { direction: 'Eastbound to Port Jefferson', stopName: 'Stony Brook Station', minutes: 26, live: false },
    ],
    predictions: [
      { minutes: 4, live: true },
      { minutes: 18, live: false },
      { minutes: 34, live: true },
    ],
    // Full real branch (Penn Station through Port Jefferson), not just the Stony
    // Brook-local segment — matches firebase/functions/static_data/lirr's actual station order, so
    // this reads correctly for a rider boarding anywhere on the branch. offsetMinutes are
    // real GTFS inter-station durations (firebase/functions/static_data/lirr/stop_times.txt) chained
    // end to end — not one single real trip_id (LIRR splits some trips at Huntington,
    // electric/diesel), but every hop length is real. scheduleStopsFromNow() below projects
    // these onto the actual current time so "Route stops" tracks real time instead of a
    // fixed baked-in schedule.
    mapLabels: ['Penn Station', 'Woodside', 'Forest Hills', 'Kew Gardens', 'Jamaica', 'Elmont-UBS Arena', 'New Hyde Park', 'Merillon Avenue', 'Mineola', 'Carle Place', 'Westbury', 'Hicksville', 'Syosset', 'Cold Spring Harbor', 'Huntington', 'Greenlawn', 'Northport', 'Kings Park', 'Smithtown', 'St. James', 'Stony Brook', 'Port Jefferson'],
    mapPath: Array.from({ length: 22 }, (_, i) => [980 - i * 46, 460 + (i % 2 === 0 ? 10 : -10)] as Point),
    mapStops: Array.from({ length: 22 }, (_, i) => i),
    stops: [
      { name: 'Penn Station', offsetMinutes: 0 },
      { name: 'Woodside', offsetMinutes: 10 },
      { name: 'Forest Hills', offsetMinutes: 15 },
      { name: 'Kew Gardens', offsetMinutes: 17 },
      { name: 'Jamaica', offsetMinutes: 22 },
      { name: 'Elmont-UBS Arena', offsetMinutes: 32 },
      { name: 'New Hyde Park', offsetMinutes: 35 },
      { name: 'Merillon Avenue', offsetMinutes: 38 },
      { name: 'Mineola', offsetMinutes: 40 },
      { name: 'Carle Place', offsetMinutes: 43 },
      { name: 'Westbury', offsetMinutes: 46 },
      { name: 'Hicksville', offsetMinutes: 51 },
      { name: 'Syosset', offsetMinutes: 58 },
      { name: 'Cold Spring Harbor', offsetMinutes: 64 },
      { name: 'Huntington', offsetMinutes: 70 },
      { name: 'Greenlawn', offsetMinutes: 75 },
      { name: 'Northport', offsetMinutes: 80 },
      { name: 'Kings Park', offsetMinutes: 90 },
      { name: 'Smithtown', offsetMinutes: 99 },
      { name: 'St. James', offsetMinutes: 105 },
      { name: 'Stony Brook', offsetMinutes: 111 },
      { name: 'Port Jefferson', offsetMinutes: 123 },
    ],
    // These stops are authored Penn Station -> Port Jefferson, matching real GTFS order and
    // the real map's geometry (portJeffersonGeometry.ts) — that's directions[1] (Eastbound to
    // Port Jefferson), not directions[0] like every other route here.
    stopsDirectionIndex: 1,
    alert: 'No delays reported on this route.',
  },
  {
    id: 's1',
    agency: 'Suffolk County Transit',
    shortName: 'S1',
    routeName: 'S1',
    color: routeColors.s1,
    direction: 'Northbound',
    destination: 'Halesite',
    directions: [
      { direction: 'Northbound to Halesite', stopName: 'Deer Park Ave at Main St', minutes: 6, live: true },
      { direction: 'Southbound to Amityville', stopName: 'Deer Park Ave at Main St', minutes: 14, live: false },
    ],
    predictions: [
      { minutes: 6, live: true },
      { minutes: 14, live: false },
      { minutes: 28, live: true },
    ],
    mapLabels: ['Amityville', 'North Babylon', 'Deer Park', 'Dix Hills', 'Halesite'],
    mapPath: [[240, 1380], [250, 1200], [270, 980], [300, 760], [322, 560], [330, 395], [312, 290]],
    mapStops: [0, 1, 2, 4, 6],
    stops: [
      { name: 'Amityville Station', offsetMinutes: 0 },
      { name: 'North Babylon', offsetMinutes: 9 },
      { name: 'Deer Park Ave', offsetMinutes: 17 },
      { name: 'Dix Hills', offsetMinutes: 28 },
      { name: 'Halesite', offsetMinutes: 41 },
    ],
    alert: 'Minor traffic delays near Deer Park Avenue.',
  },
  {
    id: 'e',
    agency: 'MTA Subway',
    shortName: 'E',
    routeName: 'E Train',
    color: routeColors.e,
    direction: 'Downtown',
    destination: 'World Trade Center',
    directions: [
      { direction: 'Downtown to World Trade Center', stopName: 'Sutphin Blvd–Archer Av', minutes: 4, live: true },
      { direction: 'Uptown to Jamaica Center', stopName: 'Sutphin Blvd–Archer Av', minutes: 11, live: false },
    ],
    predictions: [
      { minutes: 4, live: true },
      { minutes: 11, live: false },
      { minutes: 19, live: true },
    ],
    mapLabels: ['Jamaica Center', 'Sutphin Blvd', 'Queens Plaza', '42 St', 'World Trade Center'],
    mapPath: [[1000, 1060], [850, 1090], [700, 1120], [580, 1145], [460, 1170], [240, 1215], [40, 1232]],
    mapStops: [0, 1, 2, 4, 6],
    stops: [
      { name: 'Jamaica Center', offsetMinutes: 0 },
      { name: 'Sutphin Blvd–Archer Av', offsetMinutes: 4 },
      { name: 'Queens Plaza', offsetMinutes: 21 },
      { name: '42 St–Port Authority', offsetMinutes: 32 },
      { name: 'World Trade Center', offsetMinutes: 45 },
    ],
    alert: 'No delays reported on this route.',
  },
  {
    id: '51',
    agency: 'Suffolk County Transit',
    shortName: '51',
    routeName: 'Route 51',
    color: routeColors['51'],
    direction: 'Eastbound',
    destination: 'Patchogue',
    directions: [
      { direction: 'Eastbound to Patchogue', stopName: 'Stony Brook University', minutes: 9, live: true },
      { direction: 'Westbound to Port Jefferson', stopName: 'Stony Brook University', minutes: 22, live: false },
    ],
    predictions: [
      { minutes: 9, live: true },
      { minutes: 22, live: false },
      { minutes: 38, live: true },
    ],
    mapLabels: ['Port Jefferson', 'Stony Brook', 'Centereach', 'Holbrook', 'Patchogue'],
    mapPath: [[980, 354], [880, 372], [760, 405], [612, 430], [590, 500], [545, 530], [450, 560], [435, 700], [475, 822], [600, 835], [640, 900], [652, 1080], [660, 1250], [666, 1380]],
    mapStops: [0, 7, 11, 12, 13],
    stops: [
      { name: 'Port Jefferson Station', offsetMinutes: 0 },
      { name: 'Stony Brook University', offsetMinutes: 13 },
      { name: 'Centereach Mall', offsetMinutes: 30 },
      { name: 'Holbrook', offsetMinutes: 43 },
      { name: 'Patchogue Station', offsetMinutes: 59 },
    ],
    alert: 'No delays reported on this route.',
  },
  {
    id: '7',
    agency: 'MTA Subway',
    shortName: '7',
    routeName: '7 Train',
    color: routeColors['7'],
    direction: 'Westbound',
    destination: '34 St–Hudson Yards',
    directions: [
      { direction: 'Westbound to Hudson Yards', stopName: 'Flushing–Main St', minutes: 3, live: true },
      { direction: 'Eastbound to Flushing', stopName: 'Times Sq–42 St', minutes: 8, live: false },
    ],
    predictions: [
      { minutes: 3, live: true },
      { minutes: 8, live: false },
      { minutes: 15, live: true },
    ],
    mapLabels: ['Flushing', 'Jackson Hts', 'Queensboro Plaza', 'Times Sq', 'Hudson Yards'],
    mapPath: [[1000, 990], [820, 1000], [652, 1020], [450, 1060], [270, 1080], [0, 1100]],
    mapStops: [0, 1, 3, 4, 5],
    stops: [
      { name: 'Flushing–Main St', offsetMinutes: 0 },
      { name: 'Jackson Hts–Roosevelt Av', offsetMinutes: 14 },
      { name: 'Queensboro Plaza', offsetMinutes: 24 },
      { name: 'Times Sq–42 St', offsetMinutes: 36 },
      { name: '34 St–Hudson Yards', offsetMinutes: 40 },
    ],
    alert: 'No delays reported on this route.',
  },
] as const;

export const routeById = Object.fromEntries(
  routes.map((route) => [route.id, route]),
) as Record<RouteId, RouteDetail>;

export const allNearbyRoutes = [
  routeById.ronkonkoma,
  routeById.e,
  routeById.s1,
  routeById['7'],
  routeById['51'],
] as const;

export const DEFAULT_PINNED_ROUTE_IDS: readonly RouteId[] = ['ronkonkoma'];

export type RecentTripId = 'penn-station' | 'times-square' | 'patchogue';

export type RecentTripLeg = {
  agency: string;
  routeId: RouteId;
  alightStop: string;
  alightTime: string;
  boardStop: string;
  boardTime: string;
  color: string;
  direction: string;
  routeName: string;
  shortName: string;
};

export type RecentTrip = {
  destination: string;
  durationMinutes: number;
  fare: string;
  id: RecentTripId;
  legs: readonly RecentTripLeg[];
  origin: string;
  recency: string;
};

export const recentTrips: readonly RecentTrip[] = [
  {
    id: 'penn-station',
    destination: 'Penn Station',
    durationMinutes: 72,
    fare: '$14.25',
    origin: 'Stony Brook University',
    recency: 'Yesterday',
    legs: [
      {
        agency: routeById.ronkonkoma.agency,
        routeId: 'ronkonkoma',
        alightStop: 'Penn Station',
        alightTime: '11:16 AM',
        boardStop: 'Stony Brook Station',
        boardTime: '10:04 AM',
        color: routeById.ronkonkoma.color,
        direction: 'Westbound to Penn Station',
        routeName: routeById.ronkonkoma.routeName,
        shortName: routeById.ronkonkoma.shortName,
      },
    ],
  },
  {
    id: 'times-square',
    destination: 'Times Square',
    durationMinutes: 94,
    fare: '$17.15',
    origin: 'Stony Brook University',
    recency: '3 days ago',
    legs: [
      {
        agency: routeById.ronkonkoma.agency,
        routeId: 'ronkonkoma',
        alightStop: 'Jamaica',
        alightTime: '9:43 AM',
        boardStop: 'Stony Brook Station',
        boardTime: '8:42 AM',
        color: routeById.ronkonkoma.color,
        direction: 'Westbound to Penn Station',
        routeName: routeById.ronkonkoma.routeName,
        shortName: routeById.ronkonkoma.shortName,
      },
      {
        agency: routeById.e.agency,
        routeId: 'e',
        alightStop: '42 St–Port Authority',
        alightTime: '10:16 AM',
        boardStop: 'Sutphin Blvd–Archer Av',
        boardTime: '9:51 AM',
        color: routeById.e.color,
        direction: 'Downtown toward World Trade Center',
        routeName: routeById.e.routeName,
        shortName: routeById.e.shortName,
      },
    ],
  },
  {
    id: 'patchogue',
    destination: 'Patchogue Station',
    durationMinutes: 51,
    fare: '$2.25',
    origin: 'Stony Brook University',
    recency: 'Last week',
    legs: [
      {
        agency: routeById['51'].agency,
        routeId: '51',
        alightStop: 'Patchogue Station',
        alightTime: '4:01 PM',
        boardStop: 'Stony Brook University',
        boardTime: '3:10 PM',
        color: routeById['51'].color,
        direction: 'Eastbound to Patchogue',
        routeName: routeById['51'].routeName,
        shortName: routeById['51'].shortName,
      },
    ],
  },
] as const;

export const recentTripById = Object.fromEntries(
  recentTrips.map((trip) => [trip.id, trip]),
) as Record<RecentTripId, RecentTrip>;

export type RoutePreference = 'fastest' | 'transfers' | 'cheapest';
export type ItineraryId = 'rail-fast' | 'few-transfers' | 'budget' | 'subway-mix';

export type Itinerary = {
  durationMinutes: number;
  fare: string;
  departureOffsetMinutes: number;
  id: ItineraryId;
  preference: RoutePreference;
  recommended: boolean;
  segments: readonly Pick<
    RouteDetail,
    'agency' | 'color' | 'destination' | 'direction' | 'id' | 'routeName' | 'shortName'
  >[];
  transfers: number;
};

export const itineraries: readonly Itinerary[] = [
  {
    id: 'rail-fast',
    recommended: true,
    preference: 'fastest',
    segments: [routeById.ronkonkoma, routeById.e],
    fare: '$14.25',
    durationMinutes: 72,
    transfers: 1,
    departureOffsetMinutes: 4,
  },
  {
    id: 'few-transfers',
    recommended: false,
    preference: 'transfers',
    segments: [routeById['51'], routeById['7']],
    fare: '$5.80',
    durationMinutes: 91,
    transfers: 1,
    departureOffsetMinutes: 9,
  },
  {
    id: 'budget',
    recommended: false,
    preference: 'cheapest',
    segments: [routeById.s1, routeById.e, routeById['7']],
    fare: '$2.90',
    durationMinutes: 108,
    transfers: 2,
    departureOffsetMinutes: 6,
  },
  {
    id: 'subway-mix',
    recommended: false,
    preference: 'fastest',
    segments: [routeById.e, routeById['7']],
    fare: '$2.90',
    durationMinutes: 84,
    transfers: 1,
    departureOffsetMinutes: 11,
  },
] as const;

export const itineraryById = Object.fromEntries(
  itineraries.map((itinerary) => [itinerary.id, itinerary]),
) as Record<ItineraryId, Itinerary>;

/** Minutes after midnight that the prototype treats as "now" (10:00 AM). */
export const MOCK_NOW_MINUTES = 10 * 60;

export type TripTimeChoice =
  | { mode: 'now' }
  | { mode: 'depart' | 'arrive'; minutes: number };

export type ItinerarySchedule = {
  arrival: number;
  departure: number;
  label: string;
};

const MINUTES_PER_DAY = 24 * 60;

function wrapMinutes(minutes: number) {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function formatClockTime(minutes: number) {
  const wrapped = wrapMinutes(minutes);
  const hours = Math.floor(wrapped / 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(wrapped % 60).padStart(2, '0')} ${period}`;
}

export function formatTripTimeChoice(choice: TripTimeChoice) {
  if (choice.mode === 'now') return 'Leave now';
  return `${choice.mode === 'depart' ? 'Depart' : 'Arrive by'} ${formatClockTime(choice.minutes)}`;
}

export type ScheduledStop = { name: string; time: string };

/**
 * `route.stops` in the order a rider traveling in `directionIndex` actually passes them —
 * reversed and re-anchored from the route's own authored order (`stopsDirectionIndex`,
 * default 0) when showing the opposite direction. Without this, a route's "Route stops" list
 * would always read in one fixed physical order regardless of which direction is selected,
 * which is backwards for the other direction (e.g. showing the origin as the final stop).
 */
export function stopsForDirection(
  route: Pick<RouteDetail, 'stops' | 'stopsDirectionIndex'>,
  directionIndex: number,
): readonly RouteStop[] {
  const naturalIndex = route.stopsDirectionIndex ?? 0;
  if (directionIndex === naturalIndex) return route.stops;
  const total = route.stops[route.stops.length - 1]?.offsetMinutes ?? 0;
  return [...route.stops].reverse().map((stop) => ({ name: stop.name, offsetMinutes: total - stop.offsetMinutes }));
}

/**
 * Projects a (direction-ordered) stop list's relative offsets onto actual wall-clock time,
 * anchored so the first stop departs `leadMinutes` from now. This is what makes "Route stops"
 * track real time — matching what a real transit app shows — instead of a fixed baked-in schedule.
 */
export function scheduleStopsFromNow(
  stops: readonly RouteStop[],
  nowMinutes: number,
  leadMinutes: number,
): readonly ScheduledStop[] {
  const anchor = nowMinutes + leadMinutes;
  return stops.map((stop) => ({ name: stop.name, time: formatClockTime(anchor + stop.offsetMinutes) }));
}

export function scheduleItinerary(
  itinerary: Pick<Itinerary, 'departureOffsetMinutes' | 'durationMinutes'>,
  choice: TripTimeChoice,
): ItinerarySchedule {
  const offset = itinerary.departureOffsetMinutes;
  if (choice.mode === 'arrive') {
    const arrival = wrapMinutes(choice.minutes - offset);
    const departure = wrapMinutes(arrival - itinerary.durationMinutes);
    return { arrival, departure, label: `Departs ${formatClockTime(departure)} · Arrives ${formatClockTime(arrival)}` };
  }
  const start = choice.mode === 'now' ? MOCK_NOW_MINUTES : choice.minutes;
  const departure = wrapMinutes(start + offset);
  const arrival = wrapMinutes(departure + itinerary.durationMinutes);
  const label = choice.mode === 'now'
    ? `Leaves in ${offset} min · ${formatClockTime(departure)}`
    : `Departs ${formatClockTime(departure)} · Arrives ${formatClockTime(arrival)}`;
  return { arrival, departure, label };
}
