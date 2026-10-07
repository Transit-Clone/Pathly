import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Polygon, type Region } from 'react-native-maps';

import { googleMapStyle } from '../data/mapStyle';
import { SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useTheme } from '../theme/AppSettings';

const INITIAL_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };
const SNAP_BACK_DURATION_MS = 250;

// react-native-maps has no Rectangle component; a closed 4-point Polygon draws the same outline.
const SERVICE_AREA_OUTLINE = [
  { latitude: SERVICE_AREA_BOUNDS.north, longitude: SERVICE_AREA_BOUNDS.west },
  { latitude: SERVICE_AREA_BOUNDS.north, longitude: SERVICE_AREA_BOUNDS.east },
  { latitude: SERVICE_AREA_BOUNDS.south, longitude: SERVICE_AREA_BOUNDS.east },
  { latitude: SERVICE_AREA_BOUNDS.south, longitude: SERVICE_AREA_BOUNDS.west },
];

/**
 * Where the home map's camera rests, so it can be restored when the map is rebuilt (returning
 * from a route). Native keeps its region span; web keeps its zoom and its raw center (before the
 * header offset).
 */
export type HomeMapCamera = { latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number; zoom?: number };

type Padding = { bottom?: number; left?: number; right?: number; top?: number };

type GoogleMapViewProps = {
  /** Camera to open on instead of the rider's location (e.g. where they had panned before). */
  initialCamera?: HomeMapCamera | null;
  location: Coordinates;
  /** Every time the map comes to rest, wherever it is. */
  onCameraChange?: (camera: HomeMapCamera) => void;
  onUserPan?: () => void;
  /** After the rider pans the map and it comes to rest: the center of the visible (padded) area. */
  onUserMoveEnd?: (center: Coordinates) => void;
  padding?: Padding;
  /** Incremented to center the map on `location`; later GPS updates alone never move the map. */
  recenterRequest?: number;
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
export function GoogleMapView({ initialCamera, location, onCameraChange, onUserMoveEnd, onUserPan, padding, recenterRequest = 0, testID = 'google-map-view' }: GoogleMapViewProps) {
  const mapRef = useRef<MapView>(null);
  // Places hidden, and recolored in the dark theme (see mapStyle.ts).
  const { isDark } = useTheme();
  const mapStyle = useMemo(() => googleMapStyle(isDark), [isDark]);
  // Set by a rider drag so programmatic moves (recentering on GPS) don't count as exploring.
  const userMoved = useRef(false);
  const [region, setRegion] = useState<Region>(() => (initialCamera
    ? {
      latitude: initialCamera.latitude,
      longitude: initialCamera.longitude,
      latitudeDelta: initialCamera.latitudeDelta ?? INITIAL_DELTA.latitudeDelta,
      longitudeDelta: initialCamera.longitudeDelta ?? INITIAL_DELTA.longitudeDelta,
    }
    : { ...location, ...INITIAL_DELTA }));

  // Re-centers only on a new request (the first GPS fix and the location button), so a rider who
  // has panned away isn't pulled back by routine GPS updates, and a rebuilt map keeps its camera.
  const handledRecenterRequest = useRef(recenterRequest);
  useEffect(() => {
    if (recenterRequest === handledRecenterRequest.current) return;
    handledRecenterRequest.current = recenterRequest;
    mapRef.current?.animateToRegion({ ...location, ...INITIAL_DELTA }, SNAP_BACK_DURATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request only; `location` is read at request time
  }, [recenterRequest]);

  const onRegionChangeComplete = useCallback((nextRegion: Region) => {
    const clamped = clampToServiceArea(nextRegion);
    setRegion(clamped);
    onCameraChange?.(clamped);
    if (clamped.latitude !== nextRegion.latitude || clamped.longitude !== nextRegion.longitude) {
      mapRef.current?.animateToRegion(clamped, SNAP_BACK_DURATION_MS);
    }
    // With mapPadding, the Google provider reports the padded (visible) area's center.
    if (userMoved.current) {
      userMoved.current = false;
      onUserMoveEnd?.({ latitude: clamped.latitude, longitude: clamped.longitude });
    }
  }, [onCameraChange, onUserMoveEnd]);

  return (
    <MapView
      mapPadding={{ top: padding?.top ?? 0, right: padding?.right ?? 0, bottom: padding?.bottom ?? 0, left: padding?.left ?? 0 }}
      onPanDrag={() => {
        userMoved.current = true;
        onUserPan?.();
      }}
      onRegionChangeComplete={onRegionChangeComplete}
      customMapStyle={mapStyle}
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
