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

/** User's current GPS location; falls back to Stony Brook if permission is denied or lookup fails. */
export function useCurrentLocation() {
  const [location, setLocation] = useState<Coordinates>(SERVICE_AREA_FALLBACK);

  const refresh = useCallback(async () => {
    const coordinates = await fetchCurrentCoordinates();
    if (coordinates) setLocation(coordinates);
  }, []);

  useEffect(() => {
    (async () => {
      const coordinates = await fetchCurrentCoordinates();
      if (coordinates) setLocation(coordinates);
    })();
  }, []);

  return { location, refresh };
}
