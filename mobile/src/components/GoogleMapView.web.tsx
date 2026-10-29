import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import type { MapLine } from '../data/lineLayers';
import { googleMapStyle } from '../data/mapStyle';
import { themedRouteColor } from '../data/routeColors';
import { MAP_EXPLORATION_BOUNDS } from '../data/serviceArea';
import { addressAfterName } from '../data/placesSearch';
import { metersPerPixelAtZoom, SAVED_PIN, savedPinSvgUrl, savedPlaceColor, stackSavedPins } from '../data/savedPlacePin';
import { locationPoint, savedPlaceName, type SavedLocation } from '../data/userData';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useTheme } from '../theme/AppSettings';
import { iconPaths } from './Icon';
import { savedLocationIcon } from './SavedPlacesStrip';
import { HeadingBeamMarker } from './HeadingBeamMarker';
import { centerOffsetFrom, glideMapTo } from './webMapGlide';

const ZOOM = 14;
const MIN_ZOOM = 8;

const containerStyle = { width: '100%', height: '100%' };

// Keep the camera near the region, with a generous browsing margin and a soft viewport edge.
// disableDefaultUI drops the satellite/map-type toggle, street view pegman, fullscreen
// button, and zoom buttons the API shows by default — none of that fits this app's own UI.
const baseMapOptions = {
  restriction: {
    latLngBounds: MAP_EXPLORATION_BOUNDS,
    strictBounds: false,
  },
  minZoom: MIN_ZOOM,
  disableDefaultUI: true,
  clickableIcons: false,
};

/**
 * Where the home map's camera rests, so it can be restored when the map is rebuilt (returning
 * from a route). Native keeps its region span; web keeps its zoom and its raw center (before the
 * header offset).
 */
export type HomeMapCamera = { latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number; zoom?: number };

type Padding = { bottom?: number; left?: number; right?: number; top?: number };

/**
 * The map's container runs up behind the header, so its own center sits `topInset / 2` px above
 * the center of what the rider can actually see. Converts that pixel offset to latitude.
 */
function visibleCenterOf(map: google.maps.Map, topInset: number): Coordinates | null {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const height = map.getDiv().clientHeight;
  if (!center || !bounds || !height) return null;
  const latPerPixel = (bounds.getNorthEast().lat() - bounds.getSouthWest().lat()) / height;
  return { latitude: center.lat() - (topInset / 2) * latPerPixel, longitude: center.lng() };
}

type GoogleMapViewProps = {
  /** Camera to open on instead of the rider's location (e.g. where they had panned before). */
  initialCamera?: HomeMapCamera | null;
  location: Coordinates;
  /** Every time the map comes to rest, wherever it is. */
  onCameraChange?: (camera: HomeMapCamera) => void;
  /** After the rider pans the map and it comes to rest: the center of the visible area below the header. */
  onUserMoveEnd?: (center: Coordinates) => void;
  onUserPan?: () => void;
  padding?: Padding;
  /** Incremented to center the map on `location`; later GPS updates alone never move the map. */
  recenterRequest?: number;
  /**
   * Accepted for parity with native, never called: without a Map ID the web map can't rotate or
   * tilt, so it never needs reorienting.
   */
  onOrientationChange?: (orientation: { heading: number; rotated: boolean }) => void;
  reorientRequest?: number;
  /** A click on the map (admin: show its coordinates). */
  onPress?: (point: Coordinates) => void;
  /** A long press (or right-click) on the map (admin: choose a mock location). */
  onLongPress?: (point: Coordinates) => void;
  /** Saved destinations with valid coordinates, drawn as tappable pins. */
  savedLocations?: readonly SavedLocation[];
  /** Transit lines the rider switched on, drawn under everything else. */
  lines?: readonly MapLine[];
  /** A marker tapped: its place, and every place stacked with it there (itself included). */
  onSavedLocationPress?: (location: SavedLocation, stack: readonly SavedLocation[]) => void;
  /** Accepted for parity with native: the web map always draws its own location dot. */
  simulatedLocation?: boolean;
  testID?: string;
};

const LONG_PRESS_MS = 600;

/**
 * react-native-maps has no web build; this renders the real Google Maps JS API instead.
 * The JS API has no native-SDK-style "mapPadding" (which keeps the map full-bleed but biases
 * where it treats as centered). The map runs up to the top edge behind the floating header
 * like native; the bottom is sized to the sheet's top. To keep `center` centered in the
 * visible gap below the header, the map is panned up by half the top padding.
 */
export function GoogleMapView({ initialCamera, lines = [], location, onCameraChange, onLongPress, onPress, onSavedLocationPress, onUserMoveEnd, onUserPan, padding, recenterRequest = 0, savedLocations = [], testID = 'google-map-view' }: GoogleMapViewProps) {
  // The JS API has no long-press event: a press held still for LONG_PRESS_MS counts as one.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const pointOf = (event: google.maps.MapMouseEvent): Coordinates | null => (event.latLng ? { latitude: event.latLng.lat(), longitude: event.latLng.lng() } : null);
  // Set by a rider drag so programmatic moves (recentering on GPS) don't count as exploring.
  const userMoved = useRef(false);
  // No Map ID: Google ignores inline styles on cloud-styled maps. These hide its places and, in
  // the dark theme, recolor the map; changing them restyles the live map in place.
  const { colors, isDark } = useTheme();
  const mapOptions = useMemo(() => ({ ...baseMapOptions, styles: googleMapStyle(isDark) }), [isDark]);
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // The rider's dot follows every GPS update.
  const position = useMemo(() => ({ lat: location.latitude, lng: location.longitude }), [location]);
  // The camera only follows a recenter request (the first GPS fix and the location button), so a
  // rider who has panned away isn't pulled back by routine GPS updates. A rebuilt map (returning
  // from a route) opens on its saved camera until the next request.
  const [mountRecenterRequest] = useState(recenterRequest);
  const [restoredCenter] = useState(() => (initialCamera ? { lat: initialCamera.latitude, lng: initialCamera.longitude } : null));
  const [initialZoom] = useState(() => initialCamera?.zoom ?? ZOOM);
  // Followed so saved-place pins can stack once zooming out would make them collide.
  const [zoom, setZoom] = useState(initialZoom);
  // Converted once per change of lines, so zooming doesn't hand every polyline a new path.
  const webLines = useMemo(() => lines.map((line) => ({
    key: line.key,
    options: { clickable: false, strokeColor: themedRouteColor(line.color, isDark), strokeOpacity: 0.9, strokeWeight: 3, zIndex: 0 },
    path: line.path.map((point) => ({ lat: point.latitude, lng: point.longitude })),
  })), [isDark, lines]);
  const savedPins = useMemo(() => {
    const placed = savedLocations.flatMap((saved) => {
      const point = locationPoint(saved.address);
      return point ? [{ saved, point }] : [];
    });
    const stacks = stackSavedPins(placed.map(({ point }) => point), metersPerPixelAtZoom(zoom, placed[0]?.point.latitude ?? 0));
    return placed.map((pin, index) => ({ ...pin, ...stacks[index]! }));
  }, [savedLocations, zoom]);
  // Where the map opens; recentering after that moves the live map (below) instead.
  const [center] = useState(() => restoredCenter ?? { ...position });

  // The rider shows in the middle of the map below the floating header, not the whole map's middle.
  // A restored camera is a raw map center that already includes this.
  const topInset = padding?.top ?? 0;
  useEffect(() => {
    if (map && topInset && !restoredCenter) map.panBy(0, -topInset / 2);
  }, [map, restoredCenter, topInset]);

  // A recenter glides to the rider and, from far out, zooms back in a level at a time, so it
  // animates rather than jumping.
  const handledRecenterRequest = useRef(mountRecenterRequest);
  useEffect(() => {
    if (!map || recenterRequest === handledRecenterRequest.current) return undefined;
    handledRecenterRequest.current = recenterRequest;
    return glideMapTo(map, (zoom) => centerOffsetFrom(map, position, zoom, { x: 0, y: topInset / 2 }), Math.max(map.getZoom() ?? ZOOM, ZOOM));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request; `position` is read at request time
  }, [map, recenterRequest]);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { top: 0, right: padding?.right ?? 0, bottom: padding?.bottom ?? 0, left: padding?.left ?? 0 },
      ]}
      testID={testID}
    >
      {isLoaded ? (
        <GoogleMap
          center={center}
          mapContainerStyle={containerStyle}
          onMouseDown={onLongPress ? (event) => {
            const point = pointOf(event);
            cancelLongPress();
            if (point) longPressTimer.current = setTimeout(() => onLongPress(point), LONG_PRESS_MS);
          } : undefined}
          onMouseUp={onLongPress ? cancelLongPress : undefined}
          onClick={onPress ? (event) => {
            const point = pointOf(event);
            if (point) onPress(point);
          } : undefined}
          onRightClick={onLongPress ? (event) => {
            const point = pointOf(event);
            if (point) onLongPress(point);
          } : undefined}
          onDragStart={() => {
            cancelLongPress();
            userMoved.current = true;
            onUserPan?.();
          }}
          onIdle={() => {
            if (!map) return;
            const mapCenter = map.getCenter();
            if (mapCenter) onCameraChange?.({ latitude: mapCenter.lat(), longitude: mapCenter.lng(), zoom: map.getZoom() ?? ZOOM });
            if (!userMoved.current) return;
            userMoved.current = false;
            const visibleCenter = visibleCenterOf(map, topInset);
            if (visibleCenter) onUserMoveEnd?.(visibleCenter);
          }}
          onLoad={setMap}
          onZoomChanged={() => {
            const next = map?.getZoom();
            if (next !== undefined) setZoom(next);
          }}
          onUnmount={() => setMap(null)}
          options={mapOptions}
          zoom={initialZoom}
        >
          {webLines.map((line) => <Polyline key={line.key} options={line.options} path={line.path} />)}
          {savedPins.map(({ saved, position: pinPosition, leader }) => {
            const name = savedPlaceName(saved.address);
            const address = addressAfterName(name, saved.address.streetAddress);
            const markerLabel = address
              ? `Plan a trip to ${name}, ${address}`
              : `Plan a trip to ${name}`;
            return (
              <Marker
                clickable={onSavedLocationPress != null}
                // Centered on the place, as Google Maps marks one, with the same icon the app shows
                // drawn into the badge. Only a stack's top pin shows its icon.
                icon={{
                  url: savedPinSvgUrl(savedPlaceColor(saved.address, colors.primary), colors.savedPlaceBorder, leader ? iconPaths(savedLocationIcon(saved.address)) : null),
                  anchor: new google.maps.Point(SAVED_PIN.size / 2, SAVED_PIN.size / 2),
                }}
                key={saved.id}
                onClick={() => onSavedLocationPress?.(saved, savedPins.filter((pin) => pin.position === pinPosition).map((pin) => pin.saved))}
                options={{ optimized: false }}
                position={{ lat: pinPosition.latitude, lng: pinPosition.longitude }}
                title={markerLabel}
                zIndex={leader ? 2 : 1}
              />
            );
          })}
          <HeadingBeamMarker coordinate={location} />
          {/* The rider's blue "you are here" dot, following every GPS update. */}
          <Marker
            clickable={false}
            icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: colors.location, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }}
            position={position}
            title="Your location"
            zIndex={3}
          />
        </GoogleMap>
      ) : null}
    </View>
  );
}
