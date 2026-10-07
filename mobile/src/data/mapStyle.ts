type MapStyle = { featureType?: string; elementType?: string; stylers: Record<string, string | number>[] }[];

/**
 * Hides Google's points of interest — the names and icons of businesses, attractions, schools
 * and so on — so the map shows only streets, transit, and Pathly's own markers. Park areas keep
 * their fill; only their labels go.
 */
export const HIDE_POINTS_OF_INTEREST: MapStyle = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

/**
 * Google's map recolored to the app's dark theme (black and dark-gray surfaces, light-gray
 * labels), so the map isn't a bright block on a dark screen. Water and parks stay just
 * distinguishable; major roads are a step lighter than local streets.
 */
const DARK_MAP: MapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#16171A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E949C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#16171A' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3A3D42' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#B3B9C1' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1B1C1F' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1B1C1F' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#18241C' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1B1C1F' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#32353C' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3C4048' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#454A53' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9AA0A8' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#B3B9C1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0D1724' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4E6A88' }] },
];

/**
 * Style for every real Google map (home and route detail, web and native): places hidden in both
 * themes, plus the dark recolor in the dark theme. Applied on web as the map's `styles` option
 * (maps here use no Map ID, which would make Google ignore it) and on native as
 * react-native-maps' `customMapStyle`.
 */
export function googleMapStyle(isDark: boolean): MapStyle {
  return isDark ? [...DARK_MAP, ...HIDE_POINTS_OF_INTEREST] : HIDE_POINTS_OF_INTEREST;
}
