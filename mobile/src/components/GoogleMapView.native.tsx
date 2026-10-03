import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import { useCurrentLocation } from '../hooks/useCurrentLocation';

const INITIAL_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };
const SNAP_BACK_DURATION_MS = 250;

type Padding = { bottom?: number; left?: number; right?: number; top?: number };

type GoogleMapViewProps = {
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
export function GoogleMapView({ padding, testID = 'google-map-view' }: GoogleMapViewProps) {
  const { hasRealLocation, location } = useCurrentLocation();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>({ ...location, ...INITIAL_DELTA });

  useEffect(() => {
    if (hasRealLocation) {
      mapRef.current?.animateToRegion({ ...location, ...INITIAL_DELTA }, SNAP_BACK_DURATION_MS);
    }
  }, [hasRealLocation, location]);

  const onRegionChangeComplete = useCallback((nextRegion: Region) => {
    const clamped = clampToServiceArea(nextRegion);
    setRegion(clamped);
    if (clamped.latitude !== nextRegion.latitude || clamped.longitude !== nextRegion.longitude) {
      mapRef.current?.animateToRegion(clamped, SNAP_BACK_DURATION_MS);
    }
  }, []);

  return (
    <MapView
      mapPadding={{ top: padding?.top ?? 0, right: padding?.right ?? 0, bottom: padding?.bottom ?? 0, left: padding?.left ?? 0 }}
      onRegionChangeComplete={onRegionChangeComplete}
      provider={PROVIDER_GOOGLE}
      ref={mapRef}
      region={region}
      showsUserLocation={true}
      style={StyleSheet.absoluteFill}
      testID={testID}
    />
  );
}
