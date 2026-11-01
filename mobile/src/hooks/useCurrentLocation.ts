import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { NAVIGATION_THRESHOLDS, type NavigationFix } from '../data/enrouteNavigation';
import { SERVICE_AREA_FALLBACK } from '../data/serviceArea';
import { useDebug } from '../debug/DebugContext';
import { useNow } from './useNow';

export type Coordinates = { latitude: number; longitude: number };

function navigationFixFromPosition(position: Location.LocationObject): NavigationFix {
  const reportedAccuracy = position.coords.accuracy;
  return {
    point: { lat: position.coords.latitude, lng: position.coords.longitude },
    accuracyMeters: typeof reportedAccuracy === 'number' && Number.isFinite(reportedAccuracy) && reportedAccuracy >= 0 ? reportedAccuracy : null,
    capturedAt: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
    source: 'real',
  };
}

/**
 * expo-location's web permission check relies on `navigator.permissions`, which older Safari and
 * some in-app browsers lack, so the browser prompt would never appear. Asking for a position
 * directly still shows the prompt there; a refusal then surfaces as a position error.
 */
async function requestPermission(): Promise<Location.PermissionStatus> {
  try {
    return (await Location.requestForegroundPermissionsAsync()).status;
  } catch (error) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      return Location.PermissionStatus.GRANTED;
    }
    throw error;
  }
}

async function fetchCurrentFix(): Promise<NavigationFix | null> {
  try {
    const status = await requestPermission();
    if (status !== 'granted') return null;
    return navigationFixFromPosition(await Location.getCurrentPositionAsync({}));
  } catch {
    return null;
  }
}

const WATCH_OPTIONS = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 10_000,
  distanceInterval: 25,
};
// During a trip, checkpoints are 45 m apart for walking and each needs two agreeing fixes:
// Balanced fixes (often 100 m+ from Wi-Fi/cell on Android) and a 25 m / 10 s cadence left
// navigation lagging a block or more behind, or stuck on "poor accuracy".
const NAVIGATION_WATCH_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3_000,
  distanceInterval: 5,
};

/**
 * - 'loading': permission hasn't resolved yet, or it's granted and the first fix hasn't landed.
 * - 'located': `location` and `navigationFix` represent a real or admin-mock fix.
 * - 'unavailable': permission was denied or a fresh fix failed. `location` remains useful to
 *   browsing screens, but `navigationFix` is null unless a prior real fix exists.
 */
export type LocationStatus = 'loading' | 'located' | 'unavailable';

/**
 * User location shared by browsing and active navigation.
 *
 * `location` preserves the product's service-area fallback for non-navigation screens.
 * `navigationFix` deliberately never contains that fallback: it carries only timestamped,
 * accuracy-aware GPS evidence or the admin's authoritative mock location. A last real fix is
 * retained when a later refresh fails so maps can show it as stale while navigation rejects it
 * using its timestamp/status.
 */
export function useCurrentLocation(navigating = false) {
  const [realFix, setRealFix] = useState<NavigationFix | null>(null);
  const [status, setStatus] = useState<LocationStatus>('loading');
  const latestFixAtRef = useRef(Number.NEGATIVE_INFINITY);
  const fixRevisionRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const { mockLocation } = useDebug();
  const freshnessNow = useNow(10_000);
  const mocked = mockLocation !== undefined;
  const mockLatitude = mockLocation?.latitude;
  const mockLongitude = mockLocation?.longitude;
  const mockCapturedAt = mockLocation?.capturedAt;
  const mockRideAlong = mockLocation?.rideAlong === true;
  const mockFix = useMemo<NavigationFix | null>(
    () => (mockLatitude !== undefined && mockLongitude !== undefined && mockCapturedAt !== undefined
      ? {
        point: { lat: mockLatitude, lng: mockLongitude },
        accuracyMeters: 0,
        capturedAt: mockCapturedAt,
        source: 'mock',
        ...(mockRideAlong ? { rideAlong: true } : {}),
      }
      : null),
    // Alighting and boarding can be distinct checkpoints at one platform coordinate.
    [mockCapturedAt, mockLatitude, mockLongitude, mockRideAlong],
  );

  const acceptRealFix = useCallback((nextFix: NavigationFix) => {
    if (nextFix.capturedAt < latestFixAtRef.current) return false;
    latestFixAtRef.current = nextFix.capturedAt;
    fixRevisionRef.current += 1;
    setRealFix(nextFix);
    setStatus('located');
    return true;
  }, []);

  const refreshRealFix = useCallback(async () => {
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    const revisionAtStart = fixRevisionRef.current;
    if (revisionAtStart === 0) setStatus('loading');
    const nextFix = await fetchCurrentFix();
    if (refreshGenerationRef.current !== generation) return;
    if (nextFix) {
      acceptRealFix(nextFix);
    } else if (fixRevisionRef.current === revisionAtStart) {
      setStatus('unavailable');
    }
  }, [acceptRealFix]);

  useEffect(() => {
    if (mocked) return undefined;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      let permissionStatus: Location.PermissionStatus;
      try {
        permissionStatus = await requestPermission();
      } catch {
        if (!cancelled) setStatus('unavailable');
        return;
      }
      if (cancelled) return;
      if (permissionStatus !== 'granted') {
        setStatus('unavailable');
        return;
      }

      const revisionAtRequest = fixRevisionRef.current;
      try {
        const position = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          acceptRealFix(navigationFixFromPosition(position));
        }
      } catch {
        if (!cancelled && fixRevisionRef.current === revisionAtRequest) setStatus('unavailable');
      }
      if (cancelled) return;

      try {
        const nextSubscription = await Location.watchPositionAsync(navigating ? NAVIGATION_WATCH_OPTIONS : WATCH_OPTIONS, (position) => {
          if (cancelled) return;
          acceptRealFix(navigationFixFromPosition(position));
        });
        if (cancelled) nextSubscription.remove();
        else subscription = nextSubscription;
      } catch {
        // A usable one-shot fix remains valid even when the continuous watcher cannot start.
        if (!cancelled && fixRevisionRef.current === revisionAtRequest) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [acceptRealFix, mocked, navigating]);

  // Foreground-only navigation can miss movement while the app is suspended. Ask for one fresh
  // position on every background/inactive -> active transition; the existing watch continues.
  useEffect(() => {
    if (mocked) return undefined;
    let previousState: string | null | undefined = AppState.currentState;
    const listener = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = nextState === 'active' && previousState !== 'active';
      previousState = nextState;
      if (returnedToForeground) void refreshRealFix();
    });
    return () => listener.remove();
  }, [mocked, refreshRealFix]);

  const navigationFix = mockFix ?? realFix;
  const navigationStale = Boolean(!mockFix && realFix && freshnessNow - realFix.capturedAt > NAVIGATION_THRESHOLDS.maxRealFixAgeMs);
  const location = navigationFix
    ? { latitude: navigationFix.point.lat, longitude: navigationFix.point.lng }
    : SERVICE_AREA_FALLBACK;

  if (mockFix) {
    return {
      location,
      navigationFix: mockFix,
      status: 'located' as LocationStatus,
      refresh: async () => undefined,
      mocked: true,
      navigationStale: false,
    };
  }
  return { location, navigationFix, navigationStale, status, refresh: refreshRealFix, mocked: false };
}
