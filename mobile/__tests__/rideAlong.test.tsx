import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { AuthProvider } from '../src/auth/AuthContext';
import { rideFixFrom } from '../src/data/rideTracking';
import type { LiveSource } from '../src/data/transit';
import { DEBUG_STORAGE_KEY, DebugProvider, useDebug } from '../src/debug/DebugContext';

const mockFetchLive = jest.fn();
jest.mock('../src/data/transitLive', () => ({
  ...jest.requireActual('../src/data/transitLive'),
  fetchRouteLiveData: (...args: unknown[]) => mockFetchLive(...args),
}));

const mockAuthUser = (globalThis as unknown as { __mockAuthUser: { email: string } }).__mockAuthUser;
const SOURCE = { agencyId: 'nice', routeId: 'n6' } as LiveSource;
const RIDE = { source: SOURCE, tripId: 'bus-1', label: 'Riding along · n6 bus' };
const vehicle = (lat: number) => ({ tripId: 'bus-1', directionId: 0, lat, lon: -73.6, updatedAt: 1 });

let debug: ReturnType<typeof useDebug>;
function Probe() {
  const value = useDebug();
  useEffect(() => {
    debug = value;
  });
  return <Text>{value.mockLocation?.label}</Text>;
}
const renderProbe = () => render(<AuthProvider><DebugProvider><Probe /></DebugProvider></AuthProvider>);
const advance = (ms: number) => act(async () => {
  await jest.advanceTimersByTimeAsync(ms);
});

describe('Ride Along', () => {
  const adminEmail = mockAuthUser.email;

  beforeEach(async () => {
    await AsyncStorage.clear();
    mockFetchLive.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockAuthUser.email = adminEmail;
  });

  it('follows the vehicle feed, then returns to the real location when the trip leaves it', async () => {
    mockAuthUser.email = 'admin@gmail.com';
    renderProbe();
    await advance(0);
    expect(debug.isAdmin).toBe(true);

    act(() => debug.startRideAlong(RIDE, { lat: 40.7, lon: -73.6 }));
    expect(debug.mockLocation).toEqual(expect.objectContaining({ latitude: 40.7, rideAlong: true }));

    mockFetchLive.mockResolvedValue({ vehicles: [vehicle(40.71)] });
    await advance(15_000);
    expect(mockFetchLive).toHaveBeenCalledWith(SOURCE);
    expect(debug.mockLocation).toEqual(expect.objectContaining({ latitude: 40.71, rideAlong: true }));

    mockFetchLive.mockResolvedValue({ vehicles: [] });
    await advance(15_000);
    expect(debug.rideAlong).toBeNull();
    expect(debug.mockLocation).toBeUndefined();
  });

  it('keeps following through a failed request and stops when the mock is turned off', async () => {
    mockAuthUser.email = 'admin@gmail.com';
    renderProbe();
    await advance(0);
    act(() => debug.startRideAlong(RIDE, { lat: 40.7, lon: -73.6 }));

    mockFetchLive.mockRejectedValue(new Error('offline'));
    await advance(15_000);
    expect(debug.rideAlong).toEqual(RIDE);

    act(() => debug.setMockLocation(undefined));
    mockFetchLive.mockClear();
    await advance(30_000);
    expect(mockFetchLive).not.toHaveBeenCalled();
  });

  it('does nothing for a rider who is not an admin', async () => {
    mockAuthUser.email = 'rider@example.com';
    renderProbe();
    await advance(0);
    act(() => debug.startRideAlong(RIDE, { lat: 40.7, lon: -73.6 }));
    expect(debug.rideAlong).toBeNull();
    expect(debug.mockLocation).toBeUndefined();
    await advance(15_000);
    expect(mockFetchLive).not.toHaveBeenCalled();
  });

  it('does not come back after a restart', async () => {
    jest.useRealTimers();
    mockAuthUser.email = 'admin@gmail.com';
    await AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify({ mockLocation: { label: 'Riding along', latitude: 40.7, longitude: -73.6, rideAlong: true, capturedAt: 1 }, overlays: { ids: true, tapCoords: false } }));
    renderProbe();
    await waitFor(() => expect(debug.overlays.ids).toBe(true));
    expect(debug.mockLocation).toBeUndefined();
  });

  it('lets only a Ride Along mock count as a ride', () => {
    const fix = { point: { lat: 40.7, lng: -73.6 }, accuracyMeters: 0, capturedAt: 1000, source: 'mock' as const };
    expect(rideFixFrom(fix, false)).toBeNull();
    expect(rideFixFrom({ ...fix, rideAlong: true }, false)).toEqual({ at: 1000, lat: 40.7, lon: -73.6, accuracyMeters: 0 });
  });
});
