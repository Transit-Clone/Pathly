import {
  itineraries,
  itineraryById,
  recentTripById,
  recentTrips,
  routeById,
  routeColors,
  routes,
  scheduleItinerary,
  formatTripTimeChoice,
  MOCK_NOW_MINUTES,
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

  it('uses recognizable route-specific colors', () => {
    expect(routeColors).toEqual({
      ronkonkoma: '#a625a9',
      s1: '#d6173f',
      e: '#0139a6',
      '51': '#ff0011',
      '7': '#a625a9',
    });
    for (const route of routes) {
      expect(route.color).toBe(routeColors[route.id]);
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

  it('records the agency for every recent-trip leg', () => {
    for (const trip of recentTrips) {
      for (const leg of trip.legs) {
        expect(routes.some((route) => route.agency === leg.agency)).toBe(true);
      }
    }
    expect(recentTripById['times-square'].legs.map((leg) => leg.agency)).toEqual(['LIRR', 'MTA Subway']);
  });

  it('schedules itineraries for now, depart-at, and arrive-by choices', () => {
    const railFast = itineraryById['rail-fast'];
    expect(scheduleItinerary(railFast, { mode: 'now' }).label).toBe('Leaves in 4 min · 10:04 AM');

    for (const itinerary of itineraries) {
      const departAt = scheduleItinerary(itinerary, { mode: 'depart', minutes: 630 });
      expect(departAt.departure).toBeGreaterThanOrEqual(630);
      expect(departAt.arrival).toBe(departAt.departure + itinerary.durationMinutes);

      const arriveBy = scheduleItinerary(itinerary, { mode: 'arrive', minutes: 720 });
      expect(arriveBy.arrival).toBeLessThanOrEqual(720);
      expect(arriveBy.arrival - arriveBy.departure).toBe(itinerary.durationMinutes);
    }

    expect(scheduleItinerary(railFast, { mode: 'depart', minutes: 630 }).label).toBe('Departs 10:34 AM · Arrives 11:46 AM');
    expect(scheduleItinerary(railFast, { mode: 'depart', minutes: 23 * 60 + 30 }).label).toBe('Departs 11:34 PM · Arrives 12:46 AM');
    expect(MOCK_NOW_MINUTES).toBe(600);
  });

  it('formats leave-time choices for the control label', () => {
    expect(formatTripTimeChoice({ mode: 'now' })).toBe('Leave now');
    expect(formatTripTimeChoice({ mode: 'depart', minutes: 630 })).toBe('Depart 10:30 AM');
    expect(formatTripTimeChoice({ mode: 'arrive', minutes: 720 })).toBe('Arrive by 12:00 PM');
  });

  it('gives every route a map path with in-range stops and every leg a known route', () => {
    for (const route of routes) {
      expect(route.mapPath.length).toBeGreaterThanOrEqual(2);
      expect(route.mapStops).toHaveLength(route.mapLabels.length);
      for (const stop of route.mapStops) {
        expect(stop).toBeGreaterThanOrEqual(0);
        expect(stop).toBeLessThan(route.mapPath.length);
      }
    }
    for (const trip of recentTrips) {
      for (const leg of trip.legs) {
        expect(routeById[leg.routeId].shortName).toBe(leg.shortName);
      }
    }
    for (const itinerary of itineraries) {
      for (const segment of itinerary.segments) {
        expect(routeById[segment.id]).toBeDefined();
      }
    }
  });
});
