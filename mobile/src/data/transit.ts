import type { TransitCardProps } from '../components/TransitCard';

export const pinnedTransit: TransitCardProps[] = [
  {
    agency: 'LIRR',
    route: 'R',
    routeName: 'Ronkonkoma Branch',
    routeAccent: 'blue',
    directions: [
      { direction: 'Westbound to Penn Station', stopName: 'Stony Brook Station', minutes: 18, live: true },
      { direction: 'Eastbound to Ronkonkoma', stopName: 'Stony Brook Station', minutes: 26, live: false },
    ],
  },
];

export const nearbyTransit: TransitCardProps[] = [
  {
    agency: 'Suffolk Transit',
    route: 'S1',
    routeName: 'S1',
    routeAccent: 'green',
    directions: [
      { direction: 'Northbound to Halesite', stopName: 'Deer Park Ave at Main St', minutes: 6, live: true },
      { direction: 'Southbound to Amityville', stopName: 'Deer Park Ave at Main St', minutes: 14, live: false },
    ],
  },
  {
    agency: 'MTA Subway',
    route: 'E',
    routeName: 'E Train',
    routeAccent: 'red',
    directions: [
      { direction: 'Downtown to World Trade Center', stopName: 'Sutphin Blvd–Archer Av', minutes: 4, live: true },
      { direction: 'Uptown to Jamaica Center', stopName: 'Sutphin Blvd–Archer Av', minutes: 11, live: false },
    ],
  },
];
