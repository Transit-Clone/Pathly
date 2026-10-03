import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { SERVICE_AREA_FALLBACK } from '../data/serviceArea';

export type Coordinates = { latitude: number; longitude: number };

/** User's current GPS location; falls back to Stony Brook if permission is denied or lookup fails. */
export function useCurrentLocation() {
  const [location, setLocation] = useState<Coordinates>(SERVICE_AREA_FALLBACK);
  const [hasRealLocation, setHasRealLocation] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const position = await Location.getCurrentPositionAsync({});
        if (isMounted) {
          setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          setHasRealLocation(true);
        }
      } catch {
        // Keep the Stony Brook fallback.
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return { hasRealLocation, location };
}
