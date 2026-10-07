import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Polygon, type Region } from 'react-native-maps';

import { SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import type { Coordinates } from '../hooks/useCurrentLocation';

const INITIAL_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };
const SNAP_BACK_DURATION_MS = 250;

// react-native-maps has no Rectangle component; a closed 4-point Polygon draws the same outline.
const SERVICE_AREA_OUTLINE = [
  { latitude: SERVICE_AREA_BOUNDS.north, longitude: SERVICE_AREA_BOUNDS.west },
  { latitude: SERVICE_AREA_BOUNDS.north, longitude: SERVICE_AREA_BOUNDS.east },
  { latitude: SERVICE_AREA_BOUNDS.south, longitude: SERVICE_AREA_BOUNDS.east },
  { latitude: SERVICE_AREA_BOUNDS.south, longitude: SERVICE_AREA_BOUNDS.west },
];

type Padding = { bottom?: number; left?: number; right?: number; top?: number };

type GoogleMapViewProps = {
  location: Coordinates;
  onUserPan?: () => void;
  /** After the rider pans the map and it comes to rest: the center of the visible (padded) area. */
  onUserMoveEnd?: (center: Coordinates) => void;
  padding?: Padding;
  testID?: string;
};

/** react-native-maps has no native "restrict to bounds" prop; clamp the center back in after each pan. */
function clampToServiceArea(region: Region): Region {
  return {
    ...region,
    latitude: Math.min(Math.max(region.latitude, SERVICE_AREA_BOUNDS.south), SERVICE_AREA_BOUNDS.north),
    longitude: Math.min(Math.max(region.longitude, SERVICE_AREA_BOUNDS.west), SERVICE_AREA_BOUNDS.east),
  };
}

/** Real Google Maps view, defaulting to the user's location and panning only within NYC/Nassau/Suffolk. */
export function GoogleMapView({ location, onUserMoveEnd, onUserPan, padding, testID = 'google-map-view' }: GoogleMapViewProps) {
  const mapRef = useRef<MapView>(null);
  // Set by a rider drag so programmatic moves (recentering on GPS) don't count as exploring.
  const userMoved = useRef(false);
  const [region, setRegion] = useState<Region>({ ...location, ...INITIAL_DELTA });

  // Re-centers whenever `location` changes: on the initial GPS fix, and again whenever
  // the caller re-fetches it (e.g. the "center on me" button calling refresh()).
  useEffect(() => {
    mapRef.current?.animateToRegion({ ...location, ...INITIAL_DELTA }, SNAP_BACK_DURATION_MS);
  }, [location]);

  const onRegionChangeComplete = useCallback((nextRegion: Region) => {
    const clamped = clampToServiceArea(nextRegion);
    setRegion(clamped);
    if (clamped.latitude !== nextRegion.latitude || clamped.longitude !== nextRegion.longitude) {
      mapRef.current?.animateToRegion(clamped, SNAP_BACK_DURATION_MS);
    }
    // With mapPadding, the Google provider reports the padded (visible) area's center.
    if (userMoved.current) {
      userMoved.current = false;
      onUserMoveEnd?.({ latitude: clamped.latitude, longitude: clamped.longitude });
    }
  }, [onUserMoveEnd]);

  return (
    <MapView
      mapPadding={{ top: padding?.top ?? 0, right: padding?.right ?? 0, bottom: padding?.bottom ?? 0, left: padding?.left ?? 0 }}
      onPanDrag={() => {
        userMoved.current = true;
        onUserPan?.();
      }}
      onRegionChangeComplete={onRegionChangeComplete}
      provider={PROVIDER_GOOGLE}
      ref={mapRef}
      region={region}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={true}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
    >
      <Polygon coordinates={SERVICE_AREA_OUTLINE} fillColor="transparent" strokeColor="#0B4F9C" strokeWidth={2} />
    </MapView>
  );
}
