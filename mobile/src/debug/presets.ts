import type { MockLocation } from './DebugContext';

/** Places the team checks often: campus, the big hubs, and the ferry terminals. */
export const MOCK_LOCATION_PRESETS: readonly MockLocation[] = [
  { label: 'Stony Brook University', latitude: 40.9126, longitude: -73.1234 },
  { label: 'Penn Station', latitude: 40.7506, longitude: -73.9935 },
  { label: 'Times Square', latitude: 40.758, longitude: -73.9855 },
  { label: 'Jamaica', latitude: 40.6995, longitude: -73.8087 },
  { label: 'St. George Terminal', latitude: 40.6437, longitude: -74.0736 },
  { label: 'Wall St/Pier 11', latitude: 40.7033, longitude: -74.0057 },
  { label: 'Hicksville', latitude: 40.7676, longitude: -73.5283 },
  { label: 'Ronkonkoma', latitude: 40.8082, longitude: -73.1059 },
];

/** A label for a point chosen on the map. */
export function pinnedSpotLabel(latitude: number, longitude: number): string {
  return `Pinned spot (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
}
