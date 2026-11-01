import { act, renderHook } from '@testing-library/react-native';

import type { RideFix } from '../src/data/rideDetection';
import { normalizeBeanAvatar } from '../src/avatars/beanAvatar';
import { rideFixFrom, withOwnAvatar } from '../src/data/rideTracking';
import type { RouteLiveVehicle } from '../src/data/transitLive';
import type { TripStep } from '../src/data/tripPlanning';
import { useOnBoardVehicle, useTripRide } from '../src/hooks/useTripRide';

const mockCall = jest.fn();
const mockFetch = jest.fn();
const mockPreferences = { shareRides: true };
jest.mock('../src/lib/firebase', () => ({ callable: (name: string) => (payload: unknown) => mockCall(name, payload) }));
jest.mock('../src/data/transitLive', () => ({ fetchRouteLiveData: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('../src/data/userPreferences', () => ({ useUserPreferences: () => ({ preferences: mockPreferences }) }));

const leg = (routeId: string, directionId = 0) => ({ kind: 'transit', liveRoute: { agencyId: 'mta-bus', routeId, boardStopId: 'stop', directionId } }) as unknown as TripStep;
const walk = { kind: 'walk' } as unknown as TripStep;
const STEP_DEGREES = 0.00135; // About 150 m.

describe('useTripRide', () => {
  let vehicleLat = 40.7;

  beforeEach(() => {
    jest.useFakeTimers();
    vehicleLat = 40.7;
    mockPreferences.shareRides = true;
    mockCall.mockReset().mockImplementation(async (name: string) => ({ data: name === 'reportRide' ? { accepted: true } : { ok: true } }));
    mockFetch.mockReset().mockImplementation(async () => ({
      vehicles: [
        { tripId: 'bus-1', directionId: 0, lat: vehicleLat, lon: -73.9, updatedAt: Date.now() },
        { tripId: 'wrong-way', directionId: 1, lat: vehicleLat, lon: -73.9, updatedAt: Date.now() },
      ],
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const fixAt = (lat: number): RideFix => ({ at: Date.now(), lat, lon: -73.9, accuracyMeters: 10 });

  /** Moves the vehicle and rider together for two minutes, until the ride is confirmed. */
  const rideAlong = async (rerender: (props: { step: TripStep | undefined; fix: RideFix | null }) => void, step: TripStep) => {
    for (let sample = 0; sample < 5; sample += 1) {
      vehicleLat += STEP_DEGREES;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      await act(async () => {
        rerender({ step, fix: fixAt(vehicleLat) });
      });
    }
  };

  type Props = { step: TripStep | undefined; fix: RideFix | null };
  const mount = (step: TripStep | undefined) => renderHook(({ step: current, fix }: Props) => useTripRide(current, fix), { initialProps: { step, fix: null } as Props });

  it('asks for nothing and sends nothing with sharing off', async () => {
    mockPreferences.shareRides = false;
    const { rerender, unmount } = mount(leg('Q1'));
    await rideAlong(rerender, leg('Q1'));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCall).not.toHaveBeenCalled();
    unmount();
  });

  it('asks for nothing while walking', async () => {
    const { rerender, unmount } = mount(walk);
    await rideAlong(rerender, walk);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCall).not.toHaveBeenCalled();
    unmount();
  });

  it('shares a confirmed ride on the leg’s line and direction', async () => {
    const step = leg('Q1');
    const { result, rerender, unmount } = mount(step);
    await rideAlong(rerender, step);
    expect(result.current.ridingTripId).toBe('bus-1');
    expect(mockCall).toHaveBeenCalledWith('reportRide', expect.objectContaining({ agencyId: 'mta-bus', routeId: 'Q1', tripId: 'bus-1' }));
    unmount();
  });

  it('ends the session on moving to the next leg, without reporting it there', async () => {
    const step = leg('Q1');
    const { result, rerender, unmount } = mount(step);
    await rideAlong(rerender, step);
    mockCall.mockClear();
    await act(async () => {
      rerender({ step: leg('Q2'), fix: null });
    });
    expect(result.current.ridingTripId).toBeNull();
    expect(mockCall).toHaveBeenCalledWith('stopRide', {});
    expect(mockCall).not.toHaveBeenCalledWith('reportRide', expect.anything());
    unmount();
  });

  it('ends the session when the trip view closes', async () => {
    const step = leg('Q1');
    const { rerender, unmount } = mount(step);
    await rideAlong(rerender, step);
    mockCall.mockClear();
    unmount();
    expect(mockCall).toHaveBeenCalledWith('stopRide', {});
  });
});

describe('rideFixFrom', () => {
  const fix = { point: { lat: 40.7, lng: -73.9 }, accuracyMeters: 12, capturedAt: 1000 };

  it('takes only a fresh, real fix', () => {
    expect(rideFixFrom({ ...fix, source: 'real' }, false)).toEqual({ at: 1000, lat: 40.7, lon: -73.9, accuracyMeters: 12 });
    expect(rideFixFrom({ ...fix, source: 'real' }, true)).toBeNull();
    expect(rideFixFrom({ ...fix, source: 'mock' }, false)).toBeNull();
    expect(rideFixFrom(null, false)).toBeNull();
  });
});

describe('useOnBoardVehicle', () => {
  const vehicle = (lat: number, at: number) => ({ tripId: 'bus-1', directionId: 0, lat, lon: -73.9, updatedAt: at });
  const fix = (lat: number, at: number): RideFix => ({ at, lat, lon: -73.9, accuracyMeters: 10 });

  it('finds the vehicle moving with the rider, without any backend, with sharing off', () => {
    mockPreferences.shareRides = false;
    mockCall.mockReset();
    const start = 1_800_000_000_000;
    const { result, rerender } = renderHook(({ lat, at }: { lat: number; at: number }) => useOnBoardVehicle([vehicle(lat, at)], fix(lat, at)), { initialProps: { lat: 40.7, at: start } });
    expect(result.current).toBeNull();
    for (let sample = 1; sample <= 4; sample += 1) rerender({ lat: 40.7 + sample * STEP_DEGREES, at: start + sample * 40_000 });
    expect(result.current).toBe('bus-1');
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('withOwnAvatar', () => {
  const mine = normalizeBeanAvatar(null);
  const vehicle: RouteLiveVehicle = { tripId: 't', directionId: 0, lat: 40.7, lon: -73.9, updatedAt: 5 };

  it('adds the rider first, with sharing off', () => {
    expect(withOwnAvatar(vehicle, mine).riders).toEqual({ count: 1, avatars: [mine], you: true, feed: { lat: 40.7, lon: -73.9, updatedAt: 5 } });
  });

  it('joins the riders already shown, and never shows the rider twice', () => {
    const others = { count: 3, avatars: [mine, mine, mine], you: false, feed: { lat: 1, lon: 2, updatedAt: 3 } };
    const joined = withOwnAvatar({ ...vehicle, riders: others }, mine).riders!;
    expect(joined).toMatchObject({ count: 4, you: true, feed: others.feed });
    expect(joined.avatars).toHaveLength(3);
    const already = { ...vehicle, riders: { ...others, you: true } };
    expect(withOwnAvatar(already, mine)).toBe(already);
  });
});
