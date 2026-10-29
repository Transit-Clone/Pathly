import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { Coordinates } from '../hooks/useCurrentLocation';
import { callable } from '../lib/firebase';

/** A point's street address, split like a search result: "123 Main St" over "Stony Brook, NY 11790". */
export type PinAddress = { title: string; subtitle: string; placeId?: string };

const reverseGeocodeCallable = callable<{ lat: number; lon: number }, { address: PinAddress | null }>('reverseGeocode');

/** The phone's own geocoder (Apple's or Google Play's): free, and needs no backend. */
async function deviceAddressAt(point: Coordinates): Promise<PinAddress | null> {
  const [found] = await Location.reverseGeocodeAsync(point);
  if (!found) return null;
  const street = [found.streetNumber, found.street].filter(Boolean).join(' ');
  const title = street || found.name || '';
  const place = [found.city ?? found.subregion, [found.region, found.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return title ? { title, subtitle: place } : null;
}

/**
 * The address at a dropped pin: the phone's geocoder on Android and iOS, else (and on web) the
 * backend's Google lookup. Null when neither knows one (open water, a park), so callers fall
 * back to the coordinates.
 */
export async function addressAt(point: Coordinates): Promise<PinAddress | null> {
  if (Platform.OS !== 'web') {
    try {
      const address = await deviceAddressAt(point);
      if (address) return address;
    } catch {
      // No permission or no geocoder on this device: ask the backend instead.
    }
  }
  try {
    const { data } = await reverseGeocodeCallable({ lat: point.latitude, lon: point.longitude });
    return data.address;
  } catch {
    return null;
  }
}
