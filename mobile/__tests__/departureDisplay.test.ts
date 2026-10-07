import { applyRouteLive } from '../src/data/applyRouteLive';
import { departureDisplay, routeById } from '../src/data/transit';

describe('departureDisplay', () => {
  const now = new Date(2024, 0, 1, 15, 0, 0);

  it('counts whole minutes from 0, never "Due"', () => {
    expect(departureDisplay(0, now)).toEqual({ value: '0', unit: 'minutes', accessibility: '0 minutes' });
    expect(departureDisplay(-1, now).value).toBe('0');
    expect(departureDisplay(1, now)).toMatchObject({ value: '1', unit: 'minute' });
    expect(departureDisplay(59, now)).toMatchObject({ value: '59', unit: 'minutes' });
  });

  it('switches to the clock time at 60 minutes or more', () => {
    expect(departureDisplay(60, now)).toEqual({ value: '4:00', unit: 'PM', accessibility: 'at 4:00 PM' });
    expect(departureDisplay(124, now)).toMatchObject({ value: '5:04', unit: 'PM' });
    expect(departureDisplay(600, now)).toMatchObject({ value: '1:00', unit: 'AM' });
  });
});

describe('applyRouteLive countdown aging', () => {
  it('ages predictions since they were fetched and drops departures already past', () => {
    const fetchedAt = new Date(2024, 0, 1, 10, 0, 0).getTime();
    const route = applyRouteLive(routeById.ronkonkoma, {
      status: 'loaded',
      nearestStop: null,
      data: {
        routeId: '10',
        fetchedAt,
        vehicles: [],
        predictions: {
          towardDirection1: [{ minutes: 1, live: true, peakOffpeak: null }, { minutes: 5, live: false, peakOffpeak: null }, { minutes: 10, live: false, peakOffpeak: null }],
          towardDirection0: [],
        },
      },
    }, fetchedAt + 2 * 60_000 + 5_000);
    // ronkonkoma: directions[0] is GTFS direction 1.
    expect(route.predictions.map((prediction) => prediction.minutes)).toEqual([3, 8]);
    expect(route.directions[0].minutes).toBe(3);
  });
});
