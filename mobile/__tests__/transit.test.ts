import {
  itineraries,
  itineraryById,
  recentTripById,
  recentTrips,
  routeById,
  routes,
} from '../src/data/transit';

describe('transit prototype data', () => {
  it('provides unique shared detail records for every home route', () => {
    expect(routes.map((route) => route.id)).toEqual([
      'ronkonkoma',
      's1',
      'e',
      '51',
      '7',
    ]);
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length);

    for (const route of routes) {
      expect(routeById[route.id]).toBe(route);
      expect(route.directions).toHaveLength(2);
      expect(route.predictions.length).toBeGreaterThanOrEqual(3);
      expect(route.mapLabels.length).toBeGreaterThanOrEqual(3);
      expect(route.stops.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('provides destination recents and comparable itineraries', () => {
    expect(recentTrips.length).toBeGreaterThanOrEqual(3);
    for (const trip of recentTrips) {
      expect(recentTripById[trip.id]).toBe(trip);
      expect(trip.durationMinutes).toBeGreaterThan(0);
      expect(trip.legs.length).toBeGreaterThan(0);
    }
    expect(itineraries.length).toBeGreaterThanOrEqual(3);
    for (const itinerary of itineraries) {
      expect(itineraryById[itinerary.id]).toBe(itinerary);
      expect(itinerary.segments.length).toBeGreaterThan(0);
    }
    expect(itineraries[0]?.recommended).toBe(true);
    expect(new Set(itineraries.map((itinerary) => itinerary.preference))).toEqual(
      new Set(['fastest', 'transfers', 'cheapest']),
    );
  });
});
