import type { TransitCardProps } from '../components/TransitCard';

export const pinnedTransit: TransitCardProps[] = [
  {
    mode: 'LIRR',
    route: 'R',
    title: 'Ronkonkoma Branch',
    subtitle: 'toward Penn Station',
    arrival: '18 min',
    detail: 'Track 2',
    status: 'On time',
    accent: 'blue',
  },
];

export const nearbyTransit: TransitCardProps[] = [
  {
    mode: 'SUFFOLK TRANSIT',
    route: 'S1',
    title: 'Amityville → Halesite',
    subtitle: 'Deer Park Ave at Main St',
    arrival: '6 min',
    detail: '0.2 mi',
    status: 'On time',
    accent: 'green',
  },
  {
    mode: 'SUBWAY',
    route: 'E',
    title: 'World Trade Center',
    subtitle: 'via 8 Av local',
    arrival: '4 min',
    detail: 'Platform 1',
    status: 'Planned work',
    accent: 'red',
  },
];
