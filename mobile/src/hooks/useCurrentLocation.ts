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
 * User's current GPS location, continuously updated as they actually move (not just on mount)
 * via a location subscription; falls back to Stony Brook if permission is denied or lookup
 * fails. `refresh()` is still exposed separately for the "center on me" button, so pressing it
 * gets an immediate fresh fix rather than waiting for the subscription's next update.
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<Coordinates>(SERVICE_AREA_FALLBACK);

  const refresh = useCallback(async () => {
    const coordinates = await fetchCurrentCoordinates();
    if (coordinates) setLocation(coordinates);
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      subscription = await Location.watchPositionAsync(WATCH_OPTIONS, (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return { location, refresh };
}
