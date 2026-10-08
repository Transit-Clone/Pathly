import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small on-device cache of the last nearby list and live times, so reopening the app shows them
 * at once (marked as updating) while fresh data loads from a possibly cold backend. Entries carry
 * when they were saved; readers decide how old is still useful. Storage failures are ignored —
 * the cache is only ever a head start, never the source of truth.
 */
type Cached<T> = { savedAt: number; value: T };

export async function readCache<T>(key: string, maxAgeMs: number, now = Date.now()): Promise<T | null> {
  try {
    const text = await AsyncStorage.getItem(key);
    if (!text) return null;
    const cached = JSON.parse(text) as Cached<T>;
    return now - cached.savedAt <= maxAgeMs ? cached.value : null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T, now = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ savedAt: now, value } satisfies Cached<T>));
  } catch {
    // Best effort only.
  }
}

export const NEARBY_CACHE_KEY = 'pathly.nearby.v1';
export const LIVE_CACHE_KEY = 'pathly.live.v1';
