import { recentSearches } from './mockSearch';
import type { SearchPlace } from './placesSearch';

export const MAX_SESSION_RECENTS = 5;

// Module-level so it outlives SearchView unmounting between visits; in memory only, so it
// resets when the app restarts.
let sessionRecents: readonly SearchPlace[] = [];

/** Places picked this session (most recent first), then the sample recents, without duplicates. */
export function getRecentPlaces(): readonly SearchPlace[] {
  const sessionIds = new Set(sessionRecents.map((place) => place.id));
  return [...sessionRecents, ...recentSearches.filter((place) => !sessionIds.has(place.id))];
}

export function addSessionRecent(place: SearchPlace) {
  sessionRecents = [place, ...sessionRecents.filter((item) => item.id !== place.id)].slice(0, MAX_SESSION_RECENTS);
}

/** Test-only reset; module state otherwise leaks between test cases. */
export function clearSessionRecents() {
  sessionRecents = [];
}
