import { httpsCallable } from 'firebase/functions';

import { fetchNearbyTransit, NearbySearchSupersededError } from '../src/data/nearbyTransit';

const point = (latitude: number) => ({ latitude, longitude: -73.1 });

function nearbyCallable(): jest.Mock {
  return (httpsCallable as jest.Mock)({}, 'findNearbyTransit') as jest.Mock;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => nearbyCallable().mockReset());

it('sends one nearby search at a time, then only the latest point', async () => {
  const pending: ((value: unknown) => void)[] = [];
  nearbyCallable().mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

  const first = fetchNearbyTransit(point(40.1));
  await flush();
  // The map moved twice while the first search ran: neither is sent yet.
  const second = fetchNearbyTransit(point(40.2));
  const third = fetchNearbyTransit(point(40.3));
  await flush();
  expect(nearbyCallable()).toHaveBeenCalledTimes(1);

  pending[0]!({ data: { routes: [] } });
  await expect(first).resolves.toEqual([]);
  await expect(second).rejects.toBeInstanceOf(NearbySearchSupersededError);
  await flush();
  // Only the latest point goes out once the first answers.
  expect(nearbyCallable()).toHaveBeenCalledTimes(2);
  expect(nearbyCallable().mock.calls[1][0]).toEqual({ lat: 40.3, lon: -73.1 });

  pending[1]!({ data: { routes: [] } });
  await expect(third).resolves.toEqual([]);
});

it('a failed search does not hold up the next one', async () => {
  nearbyCallable().mockRejectedValueOnce(new Error('cold start timed out')).mockResolvedValueOnce({ data: { routes: [] } });
  await expect(fetchNearbyTransit(point(40.1))).rejects.toThrow('cold start timed out');
  await expect(fetchNearbyTransit(point(40.2))).resolves.toEqual([]);
});
