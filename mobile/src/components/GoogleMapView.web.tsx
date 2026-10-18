import { GoogleMap, Marker, Rectangle, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import { googleMapStyle } from '../data/mapStyle';
import { SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import { addressAfterName } from '../data/placesSearch';
import { SAVED_PIN, savedPinSvgUrl } from '../data/savedPlacePin';
import { locationPoint, savedPlaceName, type SavedLocation } from '../data/userData';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useTheme } from '../theme/AppSettings';
import { iconGlyph, type IconName } from './Icon';
import { savedLocationIcon } from './SavedPlacesStrip';

const ZOOM = 14;
const MIN_ZOOM = 9;

const containerStyle = { width: '100%', height: '100%' };

// Google Maps JS API supports hard pan/zoom restriction natively on web (strictBounds
// disables panning/zooming past it entirely) — no manual clamping needed here, unlike native.
// disableDefaultUI drops the satellite/map-type toggle, street view pegman, fullscreen
// button, and zoom buttons the API shows by default — none of that fits this app's own UI.
const baseMapOptions = {
  restriction: {
    latLngBounds: SERVICE_AREA_BOUNDS,
    strictBounds: true,
  },
  minZoom: MIN_ZOOM,
  disableDefaultUI: true,
  clickableIcons: false,
};

// Outlines the service area; strokeWeight-only (fillOpacity 0) so it reads as a border, not a mask.
const serviceAreaOutlineOptions = {
  fillOpacity: 0,
  strokeColor: '#0B4F9C',
  strokeOpacity: 0.6,
  strokeWeight: 2,
  clickable: false,
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
  onSavedLocationPress?: (location: SavedLocation) => void;
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
/** A saved-place pin's icon as a marker label (a star when the icon font isn't available). */
function pinLabel(icon: IconName): google.maps.MarkerLabel {
  const glyph = icon in ICON_FALLBACK ? null : iconGlyph(icon as Parameters<typeof iconGlyph>[0]);
  return glyph
    ? { color: '#FFFFFF', fontFamily: glyph.fontFamily, fontSize: '18px', text: glyph.text }
    : { color: '#FFFFFF', fontSize: '15px', fontWeight: '700', text: '★' };
}
/** Icons drawn from a font other than the one marker labels use. */
const ICON_FALLBACK = { pin: true } as const;

export function GoogleMapView({ initialCamera, location, onCameraChange, onLongPress, onPress, onSavedLocationPress, onUserMoveEnd, onUserPan, padding, recenterRequest = 0, savedLocations = [], testID = 'google-map-view' }: GoogleMapViewProps) {
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
  // rider who has panned away isn't pulled back by routine GPS updates. A new object per request,
  // even at identical coordinates, since @react-google-maps/api only calls map.setCenter() when
  // the center prop's identity changes.
  // A rebuilt map (returning from a route) opens on its saved camera until the next request.
  const [mountRecenterRequest] = useState(recenterRequest);
  const [restoredCenter] = useState(() => (initialCamera ? { lat: initialCamera.latitude, lng: initialCamera.longitude } : null));
  const [initialZoom] = useState(() => initialCamera?.zoom ?? ZOOM);
  const center = useMemo(
    () => (recenterRequest === mountRecenterRequest && restoredCenter ? restoredCenter : { ...position }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request only; `position` is read at request time
    [recenterRequest],
  );


  // Runs after GoogleMap (a child) applies the new `center`, so the offset is re-applied on every
  // recenter. A restored camera is a raw map center that already includes it.
  const topInset = padding?.top ?? 0;
  useEffect(() => {
    if (map && topInset && center !== restoredCenter) map.panBy(0, -topInset / 2);
  }, [map, center, restoredCenter, topInset]);

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
          onUnmount={() => setMap(null)}
          options={mapOptions}
          zoom={initialZoom}
        >
          <Rectangle bounds={SERVICE_AREA_BOUNDS} options={serviceAreaOutlineOptions} />
          {savedLocations.map((saved) => {
            const point = locationPoint(saved.address);
            if (!point) return null;
            const name = savedPlaceName(saved.address);
            const address = addressAfterName(name, saved.address.streetAddress);
            const markerLabel = address
              ? `Plan a trip to ${name}, ${address}`
              : `Plan a trip to ${name}`;
            return (
              <Marker
                clickable={onSavedLocationPress != null}
                // Anchored at the point's tip, so the badge stands over the place at every zoom; the
                // icon is the label, drawn in the icon font at the badge's exact center.
                icon={{
                  url: savedPinSvgUrl(colors.primary, colors.surface),
                  anchor: new google.maps.Point(SAVED_PIN.size / 2, SAVED_PIN.size + SAVED_PIN.point),
                  labelOrigin: new google.maps.Point(SAVED_PIN.size / 2, SAVED_PIN.size / 2),
                }}
                label={pinLabel(savedLocationIcon(saved.address))}
                key={saved.id}
                onClick={() => onSavedLocationPress?.(saved)}
                options={{ optimized: false }}
                position={{ lat: point.latitude, lng: point.longitude }}
                title={markerLabel}
                zIndex={2}
              />
            );
          })}
          {/* The rider's blue "you are here" dot, following every GPS update. */}
          <Marker
            clickable={false}
            icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }}
            position={position}
            title="Your location"
            zIndex={3}
          />
        </GoogleMap>
      ) : null}
    </View>
  );
}
