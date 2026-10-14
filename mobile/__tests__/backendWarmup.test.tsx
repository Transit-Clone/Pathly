import { render } from '@testing-library/react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Text } from 'react-native';

import { AuthProvider } from '../src/auth/AuthContext';
import { WARMUP_WAIT_CAP_MS, warmBackend } from '../src/data/backendWarmup';
import { fetchNearbyTransit } from '../src/data/nearbyTransit';

const STONY_BROOK = { latitude: 40.9203, longitude: -73.1285 };

/** The shared mock behind every httpsCallable(functions, name) (jest.setup.js). */
function callableNamed(name: string): jest.Mock {
  return (httpsCallable as jest.Mock)({}, name) as jest.Mock;
}

const warmupCalls = (name: string) => callableNamed(name).mock.calls.filter(([data]) => data?.warmup === true);
const realNearbyCalls = () => callableNamed('findNearbyTransit').mock.calls.filter(([data]) => data?.warmup !== true);

/** Makes the next findNearbyTransit call (the warm-up) wait until the test settles it. */
function holdNextWarmup(): { resolve: () => void; reject: () => void } {
  const settle = { resolve: () => {}, reject: () => {} };
  callableNamed('findNearbyTransit').mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        settle.resolve = () => resolve({ data: { warmed: true } });
        settle.reject = () => reject(new Error('warm-up failed'));
      }),
  );
  return settle;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  callableNamed('findNearbyTransit').mockClear();
  callableNamed('getRouteGeometry').mockClear();
});

describe('backend warm-up', () => {
  it('warms both backends once per signed-in rider per session', () => {
    render(
      <AuthProvider>
        <Text>app</Text>
      </AuthProvider>,
    );
    expect(warmupCalls('findNearbyTransit')).toEqual([[{ warmup: true }]]);
    expect(warmupCalls('getRouteGeometry')).toEqual([[{ warmup: true }]]);

    warmBackend('test-uid');
    expect(warmupCalls('findNearbyTransit')).toHaveLength(1);
    warmBackend('another-rider');
    expect(warmupCalls('findNearbyTransit')).toHaveLength(2);
  });

  it('sends nothing while no rider is signed in', () => {
    (onAuthStateChanged as jest.Mock).mockImplementationOnce((_auth, callback) => {
      callback(null);
      return () => undefined;
    });
    render(
      <AuthProvider>
        <Text>app</Text>
      </AuthProvider>,
    );
    expect(warmupCalls('findNearbyTransit')).toHaveLength(0);
    expect(warmupCalls('getRouteGeometry')).toHaveLength(0);
  });

  it('sends the first nearby search only after the warm-up finishes', async () => {
    const warmup = holdNextWarmup();
    warmBackend('test-uid');
    const search = fetchNearbyTransit(STONY_BROOK);
    await flush();
    expect(realNearbyCalls()).toHaveLength(0);

    warmup.resolve();
    await expect(search).resolves.not.toHaveLength(0);
    expect(realNearbyCalls()).toEqual([[{ lat: STONY_BROOK.latitude, lon: STONY_BROOK.longitude }]]);
  });

  it('does not let a failed warm-up block or fail the search', async () => {
    const warmup = holdNextWarmup();
    warmBackend('test-uid');
    const search = fetchNearbyTransit(STONY_BROOK);
    warmup.reject();
    await expect(search).resolves.not.toHaveLength(0);
    expect(realNearbyCalls()).toHaveLength(1);
  });

  it('stops waiting for a hung warm-up after the cap, and never waits for it again', async () => {
    jest.useFakeTimers();
    try {
      holdNextWarmup();
      warmBackend('test-uid');
      const search = fetchNearbyTransit(STONY_BROOK);
      await jest.advanceTimersByTimeAsync(WARMUP_WAIT_CAP_MS - 1);
      expect(realNearbyCalls()).toHaveLength(0);
      await jest.advanceTimersByTimeAsync(1);
      await expect(search).resolves.not.toHaveLength(0);

      // The warm-up is still hanging, but a later search goes straight out.
      await expect(fetchNearbyTransit(STONY_BROOK)).resolves.not.toHaveLength(0);
      expect(realNearbyCalls()).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
