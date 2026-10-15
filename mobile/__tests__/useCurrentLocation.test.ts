import * as Location from 'expo-location';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { SERVICE_AREA_FALLBACK } from '../src/data/serviceArea';
import { NAVIGATION_THRESHOLDS } from '../src/data/enrouteNavigation';
import { useCurrentLocation } from '../src/hooks/useCurrentLocation';

let mockDebugLocation: { label: string; latitude: number; longitude: number; capturedAt: number } | undefined;

jest.mock('../src/debug/DebugContext', () => ({
  useDebug: () => ({ mockLocation: mockDebugLocation }),
}));

const permission = Location.requestForegroundPermissionsAsync as jest.Mock;
const currentPosition = Location.getCurrentPositionAsync as jest.Mock;
const watchPosition = Location.watchPositionAsync as jest.Mock;

function position(latitude: number, longitude: number, accuracy: number | null, timestamp: number) {
  return { coords: { latitude, longitude, accuracy }, timestamp } as Location.LocationObject;
}

describe('useCurrentLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDebugLocation = undefined;
    permission.mockResolvedValue({ status: 'denied' });
    currentPosition.mockReset();
    watchPosition.mockReset().mockResolvedValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the browsing fallback out of navigation when permission is denied', async () => {
    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.location).toEqual(SERVICE_AREA_FALLBACK);
    expect(result.current.navigationFix).toBeNull();
    expect(currentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('fails safely when the permission request rejects', async () => {
    permission.mockRejectedValueOnce(new Error('location service unavailable'));

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.navigationFix).toBeNull();
    expect(currentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('propagates accuracy and capture time from one-shot and watched GPS fixes', async () => {
    let onPosition: ((next: Location.LocationObject) => void) | undefined;
    permission.mockResolvedValue({ status: 'granted' });
    currentPosition.mockResolvedValue(position(40.9, -73.1, 8, 1_000));
    watchPosition.mockImplementation(async (_options, callback) => {
      onPosition = callback;
      return { remove: jest.fn() };
    });

    const { result } = renderHook(() => useCurrentLocation());
    await waitFor(() => expect(result.current.navigationFix).toEqual({
      point: { lat: 40.9, lng: -73.1 },
      accuracyMeters: 8,
      capturedAt: 1_000,
      source: 'real',
    }));
    await waitFor(() => expect(onPosition).toBeDefined());

    act(() => onPosition!(position(40.91, -73.09, 3, 2_000)));
    expect(result.current.navigationFix).toEqual({
      point: { lat: 40.91, lng: -73.09 },
      accuracyMeters: 3,
      capturedAt: 2_000,
      source: 'real',
    });
  });

  it('uses an admin mock as authoritative location evidence without touching GPS', () => {
    mockDebugLocation = { label: 'Demo stop', latitude: 40.8, longitude: -73.2, capturedAt: 1_000 };

    const { result } = renderHook(() => useCurrentLocation());

    expect(result.current.location).toEqual({ latitude: 40.8, longitude: -73.2 });
    expect(result.current.navigationFix).toMatchObject({
      point: { lat: 40.8, lng: -73.2 },
      accuracyMeters: 0,
      source: 'mock',
    });
    expect(result.current.status).toBe('located');
    expect(result.current.mocked).toBe(true);
    expect(permission).not.toHaveBeenCalled();
    expect(currentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('emits a distinct mock fix for co-located named checkpoints', () => {
    mockDebugLocation = { label: 'Transfer — alight', latitude: 40.8, longitude: -73.2, capturedAt: 1_000 };
    const { rerender, result } = renderHook(() => useCurrentLocation());
    const alightFix = result.current.navigationFix;

    mockDebugLocation = { label: 'Transfer — board', latitude: 40.8, longitude: -73.2, capturedAt: 2_000 };
    rerender({});

    expect(result.current.navigationFix).not.toBe(alightFix);
    expect(result.current.navigationFix?.point).toEqual(alightFix?.point);
    expect(result.current.navigationFix?.capturedAt).toBeGreaterThan(alightFix?.capturedAt ?? 0);
  });

  it('removes the real-location subscription when the consumer unmounts', async () => {
    const remove = jest.fn();
    permission.mockResolvedValue({ status: 'granted' });
    currentPosition.mockResolvedValue(position(40.9, -73.1, 5, 1_000));
    watchPosition.mockResolvedValue({ remove });

    const { unmount } = renderHook(() => useCurrentLocation());
    await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1));
    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('keeps a usable one-shot fix when the continuous watcher rejects', async () => {
    permission.mockResolvedValue({ status: 'granted' });
    currentPosition.mockResolvedValue(position(40.9, -73.1, 5, 1_000));
    watchPosition.mockRejectedValueOnce(new Error('watch unavailable'));

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => expect(result.current.navigationFix?.capturedAt).toBe(1_000));
    await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('located');
  });

  it('requests a current fix when the app returns to the foreground', async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    const removeAppStateListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      onAppStateChange = callback;
      return { remove: removeAppStateListener };
    });
    permission.mockResolvedValue({ status: 'granted' });
    currentPosition
      .mockResolvedValueOnce(position(40.9, -73.1, 7, 1_000))
      .mockResolvedValueOnce(position(40.92, -73.08, 4, 3_000));

    const { result, unmount } = renderHook(() => useCurrentLocation());
    await waitFor(() => expect(result.current.navigationFix?.capturedAt).toBe(1_000));
    expect(onAppStateChange).toBeDefined();

    act(() => onAppStateChange!('background'));
    await act(async () => onAppStateChange!('active'));
    await waitFor(() => expect(result.current.navigationFix).toMatchObject({
      point: { lat: 40.92, lng: -73.08 },
      accuracyMeters: 4,
      capturedAt: 3_000,
    }));
    expect(permission).toHaveBeenCalledTimes(2);

    unmount();
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer watch fix when a slower foreground refresh fails', async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    let onPosition: ((next: Location.LocationObject) => void) | undefined;
    let rejectRefresh!: (reason?: unknown) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      onAppStateChange = callback;
      return { remove: jest.fn() };
    });
    permission.mockResolvedValue({ status: 'granted' });
    currentPosition
      .mockResolvedValueOnce(position(40.9, -73.1, 7, 1_000))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
    watchPosition.mockImplementation(async (_options, callback) => {
      onPosition = callback;
      return { remove: jest.fn() };
    });

    const { result, unmount } = renderHook(() => useCurrentLocation());
    await waitFor(() => expect(onPosition).toBeDefined());
    act(() => onAppStateChange!('background'));
    act(() => onAppStateChange!('active'));
    await waitFor(() => expect(currentPosition).toHaveBeenCalledTimes(2));

    act(() => onPosition!(position(40.92, -73.08, 4, 3_000)));
    await act(async () => rejectRefresh(new Error('foreground lookup failed')));
    await waitFor(() => expect(result.current.navigationFix?.capturedAt).toBe(3_000));
    expect(result.current.status).toBe('located');

    unmount();
  });

  it('marks a real fix stale even when the watch emits nothing else', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    permission.mockResolvedValue({ status: 'granted' });
    currentPosition.mockResolvedValue(position(40.9, -73.1, 5, 10_000));

    const { result, unmount } = renderHook(() => useCurrentLocation());
    await act(async () => undefined);
    expect(result.current.navigationStale).toBe(false);

    act(() => jest.advanceTimersByTime(NAVIGATION_THRESHOLDS.maxRealFixAgeMs + 10_000));
    expect(result.current.navigationStale).toBe(true);

    unmount();
    jest.useRealTimers();
  });
});
