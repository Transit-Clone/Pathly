export const departureOptions = ['10:00 AM', '11:00 AM'] as const;

export type DepartureOption = (typeof departureOptions)[number];

export type RonkonkomaStop = {
  name: string;
  times: Record<DepartureOption, string>;
};

export const ronkonkomaRoute = {
  agency: 'LIRR',
  direction: 'Westbound',
  destination: 'Penn Station',
  name: 'Ronkonkoma Branch',
  stops: [
    {
      name: 'Stony Brook',
      times: { '10:00 AM': '10:04 AM', '11:00 AM': '11:04 AM' },
    },
    {
      name: 'St. James',
      times: { '10:00 AM': '10:11 AM', '11:00 AM': '11:11 AM' },
    },
    {
      name: 'Smithtown',
      times: { '10:00 AM': '10:16 AM', '11:00 AM': '11:16 AM' },
    },
    {
      name: 'Kings Park',
      times: { '10:00 AM': '10:23 AM', '11:00 AM': '11:23 AM' },
    },
    {
      name: 'Northport',
      times: { '10:00 AM': '10:34 AM', '11:00 AM': '11:34 AM' },
    },
  ] satisfies RonkonkomaStop[],
} as const;
