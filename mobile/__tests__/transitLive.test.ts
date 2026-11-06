import { httpsCallable } from 'firebase/functions';

import type { LiveSource } from '../src/data/transit';
import { fetchRouteLiveData } from '../src/data/transitLive';

const getRouteLiveStatus = httpsCallable({} as never, 'getRouteLiveStatus') as unknown as jest.Mock;
const source: LiveSource = { agencyId: 'subway', routeId: '1', direction1StopId: '127N', direction0StopId: '127S', direction1Index: 0 };

describe('fetchRouteLiveData', () => {
  it("keeps the nearest stop's position, so the walk to it needs no timetable", async () => {
    getRouteLiveStatus.mockResolvedValue({
      data: {
        routeId: '1',
        routeName: '1',
        vehicles: [],
        stopPredictions: { towardDirection1: [], towardDirection0: [] },
        nearestStop: {
          distanceMeters: 120,
          direction1: { stopId: '127', name: 'Times Sq-42 St', headsign: 'Van Cortlandt Park', lat: 40.7553, lon: -73.9868 },
          direction0: { stopId: '127', name: 'Times Sq-42 St', headsign: 'South Ferry', lat: 40.7553, lon: -73.9868 },
        },
      },
    });
    const live = await fetchRouteLiveData(source, { latitude: 40.7549, longitude: -73.984 });
    expect(live.nearestStop?.direction1).toEqual({ stopId: '127', name: 'Times Sq-42 St', lat: 40.7553, lon: -73.9868 });
    expect(live.nearestStop?.direction0).toEqual({ stopId: '127', name: 'Times Sq-42 St', lat: 40.7553, lon: -73.9868 });
  });
});
