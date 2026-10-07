/**
 * Shared across every component calling useJsApiLoader (GoogleMapView, RouteMap, ...).
 * @react-google-maps/api throws if the same script `id` is ever loaded with different
 * options, so every caller must request the exact same id + libraries, even if a given
 * component doesn't itself need "marker" — not just a stable reference per file.
 */
export const GOOGLE_MAPS_SCRIPT_ID = 'pathly-google-maps-script';
export const GOOGLE_MAPS_LIBRARIES: 'marker'[] = ['marker'];
