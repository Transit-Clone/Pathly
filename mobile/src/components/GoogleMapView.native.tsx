import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, type Camera, type LongPressEvent, type MapPressEvent, type Region } from 'react-native-maps';

import type { MapLine } from '../data/lineLayers';
import { googleMapStyle } from '../data/mapStyle';
import { themedRouteColor } from '../data/routeColors';
import { MAP_EXPLORATION_BOUNDS, SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import { addressAfterName } from '../data/placesSearch';
import { metersPerPixelForSpan, SAVED_PIN, savedPlaceColor, stackSavedPins } from '../data/savedPlacePin';
import { locationPoint, savedPlaceName, type SavedLocation } from '../data/userData';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useTheme } from '../theme/AppSettings';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { HeadingBeamMarker } from './HeadingBeamMarker';
import { Icon, type IconName } from './Icon';
import { NATIVE_MAP_PROVIDER } from './mapProvider';
import { savedLocationIcon } from './SavedPlacesStrip';

/** How long saved-place pins keep redrawing after they change, so their icon font has drawn. */
const PIN_SETTLE_MS = 600;

/**
 * A saved place's map marker, as in Google Maps: its icon centered in a round badge right on the
 * place, in the place's color. A marker stacked under another leaves its icon off.
 */
function SavedPlacePin({ color, icon }: { color: string; icon: IconName | null }) {
  const { colors } = useTheme();
  return (
    <View style={[pinStyles.badge, { backgroundColor: color, borderColor: colors.savedPlaceBorder }]}>
      {icon ? <Icon color={colors.ring} name={icon} size={16} /> : null}
    </View>
  );
}

const pinStyles = StyleSheet.create({
  badge: { width: SAVED_PIN.size, height: SAVED_PIN.size, alignItems: 'center', justifyContent: 'center', borderRadius: SAVED_PIN.size / 2, borderWidth: 2.5 },
});

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

export type MapOrientation = { heading: number; rotated: boolean };
/** Within this many degrees of north-up and flat, the map counts as oriented. */
const ORIENTED_TOLERANCE_DEGREES = 2;
const REORIENT_DURATION_MS = 300;
const ORIENTATION_READ_INTERVAL_MS = 200;

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
  /** After the rider rotates or tilts the map: its heading (degrees clockwise from north) and whether it's off north-up/flat. */
  onOrientationChange?: (orientation: MapOrientation) => void;
  /** Incremented to turn the map back to north-up and flat, keeping its center and zoom. */
  reorientRequest?: number;
  /** A tap on the map (admin: show its coordinates). */
  onPress?: (point: Coordinates) => void;
  /** A long press on the map (admin: choose a mock location). */
  onLongPress?: (point: Coordinates) => void;
  /** Saved destinations with valid coordinates, drawn as tappable pins. */
  savedLocations?: readonly SavedLocation[];
  /** Transit lines the rider switched on, drawn under everything else. */
  lines?: readonly MapLine[];
  /** A marker tapped: its place, and every place stacked with it there (itself included). */
  onSavedLocationPress?: (location: SavedLocation, stack: readonly SavedLocation[]) => void;
  /** `location` is an admin's mock location, so the system GPS dot is replaced with a drawn one there. */
  simulatedLocation?: boolean;
  testID?: string;
};

/** react-native-maps has no native "restrict to bounds" prop; clamp the center back in after each pan. */
function clampToServiceArea(region: Region): Region {
  return {
    ...region,
    latitude: Math.min(Math.max(region.latitude, MAP_EXPLORATION_BOUNDS.south), MAP_EXPLORATION_BOUNDS.north),
    longitude: Math.min(Math.max(region.longitude, MAP_EXPLORATION_BOUNDS.west), MAP_EXPLORATION_BOUNDS.east),
  };
}

/** Real Google Maps view, centered locally with room to explore the surrounding region. */
export function GoogleMapView({ initialCamera, lines = [], location, onCameraChange, onLongPress, onPress, onOrientationChange, onSavedLocationPress, onUserMoveEnd, onUserPan, padding, recenterRequest = 0, reorientRequest = 0, savedLocations = [], simulatedLocation = false, testID = 'google-map-view' }: GoogleMapViewProps) {
  const mapRef = useRef<MapView>(null);
  // Places hidden, and recolored in the dark theme (see mapStyle.ts).
  const { colors, isDark } = useTheme();
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

  // Rotation and tilt aren't in the region, so the camera is read after gestures (and at most every
  // ORIENTATION_READ_INTERVAL_MS while one is in progress) to show or hide the reorient button.
  const lastOrientationRead = useRef(0);
  const readOrientation = useCallback(() => {
    if (!onOrientationChange) return;
    lastOrientationRead.current = Date.now();
    void mapRef.current?.getCamera().then((camera: Camera) => {
      const heading = (((camera.heading ?? 0) % 360) + 360) % 360;
      const offNorth = Math.min(heading, 360 - heading);
      onOrientationChange({ heading, rotated: offNorth > ORIENTED_TOLERANCE_DEGREES || (camera.pitch ?? 0) > ORIENTED_TOLERANCE_DEGREES });
    }).catch(() => undefined);
  }, [onOrientationChange]);

  const handledReorientRequest = useRef(reorientRequest);
  useEffect(() => {
    if (reorientRequest === handledReorientRequest.current) return;
    handledReorientRequest.current = reorientRequest;
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: REORIENT_DURATION_MS });
  }, [reorientRequest]);

  const onRegionChangeComplete = useCallback((nextRegion: Region) => {
    readOrientation();
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
  }, [onCameraChange, onUserMoveEnd, readOrientation]);

  // Pins that would collide at this zoom are stacked at one spot (see stackSavedPins).
  const { width: windowWidth } = useWindowDimensions();
  const savedPins = useMemo(() => {
    const placed = savedLocations.flatMap((saved) => {
      const point = locationPoint(saved.address);
      return point ? [{ saved, point }] : [];
    });
    const stacks = stackSavedPins(placed.map(({ point }) => point), metersPerPixelForSpan(region.longitudeDelta, windowWidth, region.latitude));
    return placed.map((pin, index) => ({ ...pin, ...stacks[index]! }));
  }, [savedLocations, region.longitudeDelta, region.latitude, windowWidth]);
  // Custom markers are snapshotted; keep them live briefly after they change (a pin joining or
  // leaving a stack shows or drops its icon) so the change is in the snapshot.
  const stacking = savedPins.map((pin) => (pin.leader ? '1' : '0')).join('');
  const pinLook = useMemo(() => ({ savedLocations, color: colors.primary, border: colors.savedPlaceBorder, stacking }), [savedLocations, colors.primary, colors.savedPlaceBorder, stacking]);
  const [settledLook, setSettledLook] = useState<typeof pinLook | null>(null);
  const pinsRendering = settledLook !== pinLook;
  useEffect(() => {
    const timer = setTimeout(() => setSettledLook(pinLook), PIN_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pinLook]);

  return (
    <MapView
      mapPadding={{ top: padding?.top ?? 0, right: padding?.right ?? 0, bottom: padding?.bottom ?? 0, left: padding?.left ?? 0 }}
      onPanDrag={() => {
        userMoved.current = true;
        onUserPan?.();
        if (Date.now() - lastOrientationRead.current >= ORIENTATION_READ_INTERVAL_MS) readOrientation();
      }}
      onLongPress={onLongPress ? (event: LongPressEvent) => onLongPress(event.nativeEvent.coordinate) : undefined}
      onPress={onPress ? (event: MapPressEvent) => onPress(event.nativeEvent.coordinate) : undefined}
      onRegionChangeComplete={onRegionChangeComplete}
      customMapStyle={mapStyle}
      provider={NATIVE_MAP_PROVIDER}
      ref={mapRef}
      region={region}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={!simulatedLocation}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
      userInterfaceStyle={isDark ? 'dark' : 'light'}
    >
      <Polygon coordinates={SERVICE_AREA_OUTLINE} fillColor="transparent" strokeColor="#0B4F9C" strokeWidth={2} />
      {lines.map((line) => <Polyline coordinates={[...line.path]} key={line.key} strokeColor={themedRouteColor(line.color, isDark)} strokeWidth={3} tappable={false} testID={`map-line-${line.key}`} zIndex={0} />)}
      <HeadingBeamMarker coordinate={location} />
      {savedPins.map(({ saved, position: pinPosition, leader }) => {
        const name = savedPlaceName(saved.address);
        const address = addressAfterName(name, saved.address.streetAddress);
        const markerLabel = address
          ? `Plan a trip to ${name}, ${address}`
          : `Plan a trip to ${name}`;
        return (
          <Marker
            accessibilityHint="Opens fresh trip options for this saved place"
            accessibilityLabel={markerLabel}
            accessibilityRole="button"
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={pinPosition}
            description={saved.address.streetAddress || undefined}
            key={saved.id}
            onPress={() => onSavedLocationPress?.(saved, savedPins.filter((pin) => pin.position === pinPosition).map((pin) => pin.saved))}
            testID={`saved-place-marker-${saved.id}`}
            title={name}
            tracksViewChanges={pinsRendering}
            zIndex={leader ? 2 : 1}
          >
            <SavedPlacePin color={savedPlaceColor(saved.address, colors.primary)} icon={leader ? savedLocationIcon(saved.address) : null} />
          </Marker>
        );
      })}
      {simulatedLocation ? (
        <Marker anchor={{ x: 0.5, y: 0.5 }} coordinate={location} testID="mock-location-marker" tracksViewChanges={false}>
          <CurrentLocationMarker />
        </Marker>
      ) : null}
    </MapView>
  );
}
