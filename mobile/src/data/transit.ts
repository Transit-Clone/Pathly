export type RouteId = 'ronkonkoma' | 's1' | 'e' | '51' | '7';

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

export type RouteStop = {
  name: string;
  time: string;
};

export type RouteDetail = {
  agency: string;
  alert: string;
  color: string;
  destination: string;
  direction: string;
  directions: readonly [TransitDirection, TransitDirection];
  id: RouteId;
  mapLabels: readonly string[];
  predictions: readonly RoutePrediction[];
  routeName: string;
  shortName: string;
  stops: readonly RouteStop[];
};

export const routes: readonly RouteDetail[] = [
  {
    id: 'ronkonkoma',
    agency: 'LIRR',
    shortName: 'R',
    routeName: 'Ronkonkoma Branch',
    color: '#0B4F9C',
    direction: 'Westbound',
    destination: 'Penn Station',
    directions: [
      { direction: 'Westbound to Penn Station', stopName: 'Stony Brook Station', minutes: 18, live: true },
      { direction: 'Eastbound to Ronkonkoma', stopName: 'Stony Brook Station', minutes: 26, live: false },
    ],
    predictions: [
      { minutes: 4, live: true },
      { minutes: 18, live: false },
      { minutes: 34, live: true },
    ],
    mapLabels: ['Stony Brook', 'St. James', 'Smithtown', 'Kings Park', 'Northport'],
    stops: [
      { name: 'Stony Brook', time: '10:04 AM' },
      { name: 'St. James', time: '10:11 AM' },
      { name: 'Smithtown', time: '10:16 AM' },
      { name: 'Kings Park', time: '10:23 AM' },
      { name: 'Northport', time: '10:34 AM' },
    ],
    alert: 'No delays reported on this route.',
  },
  {
    id: 's1',
    agency: 'Suffolk County Transit',
    shortName: 'S1',
    routeName: 'S1',
    color: '#13795B',
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
    stops: [
      { name: 'Amityville Station', time: '10:06 AM' },
      { name: 'North Babylon', time: '10:15 AM' },
      { name: 'Deer Park Ave', time: '10:23 AM' },
      { name: 'Dix Hills', time: '10:34 AM' },
      { name: 'Halesite', time: '10:47 AM' },
    ],
    alert: 'Minor traffic delays near Deer Park Avenue.',
  },
  {
    id: 'e',
    agency: 'MTA Subway',
    shortName: 'E',
    routeName: 'E Train',
    color: '#C43D4B',
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
    stops: [
      { name: 'Jamaica Center', time: '10:04 AM' },
      { name: 'Sutphin Blvd–Archer Av', time: '10:08 AM' },
      { name: 'Queens Plaza', time: '10:25 AM' },
      { name: '42 St–Port Authority', time: '10:36 AM' },
      { name: 'World Trade Center', time: '10:49 AM' },
    ],
    alert: 'No delays reported on this route.',
  },
  {
    id: '51',
    agency: 'Suffolk County Transit',
    shortName: '51',
    routeName: 'Route 51',
    color: '#13795B',
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
    stops: [
      { name: 'Port Jefferson Station', time: '10:09 AM' },
      { name: 'Stony Brook University', time: '10:22 AM' },
      { name: 'Centereach Mall', time: '10:39 AM' },
      { name: 'Holbrook', time: '10:52 AM' },
      { name: 'Patchogue Station', time: '11:08 AM' },
    ],
    alert: 'No delays reported on this route.',
  },
  {
    id: '7',
    agency: 'MTA Subway',
    shortName: '7',
    routeName: '7 Train',
    color: '#8B4AA5',
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
    stops: [
      { name: 'Flushing–Main St', time: '10:03 AM' },
      { name: 'Jackson Hts–Roosevelt Av', time: '10:17 AM' },
      { name: 'Queensboro Plaza', time: '10:27 AM' },
      { name: 'Times Sq–42 St', time: '10:39 AM' },
      { name: '34 St–Hudson Yards', time: '10:43 AM' },
    ],
    alert: 'No delays reported on this route.',
  },
] as const;

export const routeById = Object.fromEntries(
  routes.map((route) => [route.id, route]),
) as Record<RouteId, RouteDetail>;

export const pinnedRoutes = [routeById.ronkonkoma] as const;
export const nearbyRoutes = routes.filter((route) => route.id !== 'ronkonkoma');

export type RecentTrip = {
  destination: string;
  id: string;
  origin: string;
  recency: string;
  segments: readonly Pick<RouteDetail, 'color' | 'shortName'>[];
};

export const recentTrips: readonly RecentTrip[] = [
  {
    id: 'penn-station',
    destination: 'Penn Station',
    origin: 'Stony Brook University',
    recency: 'Yesterday',
    segments: [routeById.ronkonkoma],
  },
  {
    id: 'times-square',
    destination: 'Times Square',
    origin: 'Current location',
    recency: '3 days ago',
    segments: [routeById.s1, routeById.e],
  },
  {
    id: 'patchogue',
    destination: 'Patchogue Station',
    origin: 'Stony Brook University',
    recency: 'Last week',
    segments: [routeById['51']],
  },
] as const;

export type RoutePreference = 'fastest' | 'transfers' | 'cheapest';

export type Itinerary = {
  durationMinutes: number;
  fare: string;
  id: string;
  nextRide: string;
  preference: RoutePreference;
  recommended: boolean;
  segments: readonly Pick<RouteDetail, 'color' | 'shortName'>[];
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
    nextRide: 'Leaves in 4 min · 10:04 AM',
  },
  {
    id: 'few-transfers',
    recommended: false,
    preference: 'transfers',
    segments: [routeById['51'], routeById['7']],
    fare: '$5.80',
    durationMinutes: 91,
    transfers: 1,
    nextRide: 'Leaves in 9 min · 10:09 AM',
  },
  {
    id: 'budget',
    recommended: false,
    preference: 'cheapest',
    segments: [routeById.s1, routeById.e, routeById['7']],
    fare: '$2.90',
    durationMinutes: 108,
    transfers: 2,
    nextRide: 'Leaves in 6 min · 10:06 AM',
  },
  {
    id: 'subway-mix',
    recommended: false,
    preference: 'fastest',
    segments: [routeById.e, routeById['7']],
    fare: '$2.90',
    durationMinutes: 84,
    transfers: 1,
    nextRide: 'Leaves in 11 min · 10:11 AM',
  },
] as const;
