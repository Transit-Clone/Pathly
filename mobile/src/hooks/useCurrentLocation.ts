import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { SERVICE_AREA_FALLBACK } from '../data/serviceArea';

export type Coordinates = { latitude: number; longitude: number };

async function fetchCurrentCoordinates(): Promise<Coordinates | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  try {
    const position = await Location.getCurrentPositionAsync({});
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}

const WATCH_OPTIONS = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 10_000,
  distanceInterval: 25,
};

/**
 * - 'loading': permission hasn't resolved yet, or it's granted and the first fix hasn't landed.
 * - 'located': `location` is a real GPS fix.
 * - 'unavailable': permission denied, or the fix failed — `location` is the Stony Brook fallback.
 */
export type LocationStatus = 'loading' | 'located' | 'unavailable';

/**
 * User's current GPS location, continuously updated as they actually move (not just on mount)
 * via a location subscription; falls back to Stony Brook if permission is denied or lookup
 * fails. Fetches an immediate one-shot fix on mount (in addition to starting the watch) so the
 * map centers on the user as soon as a fix is available, rather than sitting on the fallback
 * until the watch's first callback lands (which can take up to `WATCH_OPTIONS.timeInterval`) or
 * the user presses the locate button themselves. `refresh()` is still exposed separately for
 * the "center on me" button, so pressing it gets another fresh fix on demand.
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<Coordinates>(SERVICE_AREA_FALLBACK);
  const [status, setStatus] = useState<LocationStatus>('loading');

  const refresh = useCallback(async () => {
    setStatus('loading');
    const coordinates = await fetchCurrentCoordinates();
    if (coordinates) {
      setLocation(coordinates);
      setStatus('located');
    } else {
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (permissionStatus !== 'granted') {
        setStatus('unavailable');
        return;
      }

      try {
        const position = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          setStatus('located');
        }
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
      if (cancelled) return;

      subscription = await Location.watchPositionAsync(WATCH_OPTIONS, (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus('located');
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return { location, status, refresh };
}
