export type MockSearchPlace = {
  id: string;
  title: string;
  subtitle: string;
  category: 'address' | 'campus' | 'station';
  pin: {
    x: number;
    y: number;
  };
};

export const recentSearches: readonly MockSearchPlace[] = [
  {
    id: 'recent-christian-avenue',
    title: '142 Christian Ave',
    subtitle: 'Stony Brook, NY',
    category: 'address',
    pin: { x: 0.27, y: 0.52 },
  },
  {
    id: 'recent-stony-brook-university',
    title: 'Stony Brook University',
    subtitle: 'Main Campus',
    category: 'campus',
    pin: { x: 0.58, y: 0.37 },
  },
  {
    id: 'recent-penn-station',
    title: 'Penn Station',
    subtitle: 'New York, NY',
    category: 'station',
    pin: { x: 0.73, y: 0.61 },
  },
];

export const mockSearchDestinations: readonly MockSearchPlace[] = [
  {
    id: 'terry-road-smithtown',
    title: '123 Terry Rd',
    subtitle: 'Smithtown, NY',
    category: 'address',
    pin: { x: 0.2, y: 0.43 },
  },
  {
    id: 'terry-road-commack',
    title: '123 Terry Rd',
    subtitle: 'Commack, NY',
    category: 'address',
    pin: { x: 0.48, y: 0.66 },
  },
  {
    id: 'terry-road-hauppauge',
    title: '123 Terry Rd',
    subtitle: 'Hauppauge, NY',
    category: 'address',
    pin: { x: 0.75, y: 0.4 },
  },
  {
    id: 'ronkonkoma-station',
    title: 'Ronkonkoma LIRR Station',
    subtitle: 'Railroad Ave, Ronkonkoma, NY',
    category: 'station',
    pin: { x: 0.67, y: 0.57 },
  },
];

export function findMockDestinations(query: string): readonly MockSearchPlace[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  return mockSearchDestinations.filter((destination) => {
    const searchableText = `${destination.title} ${destination.subtitle}`.toLocaleLowerCase();

    return tokens.every((token) => searchableText.includes(token));
  });
}
