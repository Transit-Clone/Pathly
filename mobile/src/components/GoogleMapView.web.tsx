import { GoogleMap, Rectangle, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import type { Coordinates } from '../hooks/useCurrentLocation';

const ZOOM = 14;
const MIN_ZOOM = 9;
// Must be a stable reference — recreating this array on every render makes
// useJsApiLoader think the script needs reloading with different libraries.
const MAP_LIBRARIES: 'marker'[] = ['marker'];

const containerStyle = { width: '100%', height: '100%' };

// Google Maps JS API supports hard pan/zoom restriction natively on web (strictBounds
// disables panning/zooming past it entirely) — no manual clamping needed here, unlike native.
// disableDefaultUI drops the satellite/map-type toggle, street view pegman, fullscreen
// button, and zoom buttons the API shows by default — none of that fits this app's own UI.
const mapOptions = {
  restriction: {
    latLngBounds: SERVICE_AREA_BOUNDS,
    strictBounds: true,
  },
  minZoom: MIN_ZOOM,
  disableDefaultUI: true,
  // Required for AdvancedMarkerElement to render reliably.
  mapId: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_MAP_ID,
};

// Outlines the service area; strokeWeight-only (fillOpacity 0) so it reads as a border, not a mask.
const serviceAreaOutlineOptions = {
  fillOpacity: 0,
  strokeColor: '#0B4F9C',
  strokeOpacity: 0.6,
  strokeWeight: 2,
  clickable: false,
};

function createUserLocationDot(): HTMLDivElement {
  const dot = document.createElement('div');
  dot.style.width = '16px';
  dot.style.height = '16px';
  dot.style.borderRadius = '50%';
  dot.style.backgroundColor = '#4285F4';
  dot.style.border = '2px solid #FFFFFF';
  dot.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, 0.15)';
  return dot;
}

type Padding = { bottom?: number; left?: number; right?: number; top?: number };

type GoogleMapViewProps = {
  location: Coordinates;
  onUserPan?: () => void;
  padding?: Padding;
  testID?: string;
};

/**
 * react-native-maps has no web build; this renders the real Google Maps JS API instead.
 * The JS API has no native-SDK-style "mapPadding" (which keeps the map full-bleed but biases
 * where it treats as centered); instead we just size the map's own container to the gap
 * between the header and the sheet, so `center` is already centered in what's visible.
 */
export function GoogleMapView({ location, onUserPan, padding, testID = 'google-map-view' }: GoogleMapViewProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'pathly-google-maps-script',
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: MAP_LIBRARIES,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  // Keyed on the `location` object itself, not its lat/lng values: HomeScreen's refresh()
  // gives a new `location` object every time it's called, even if the coordinates are
  // numerically identical (e.g. pressing "center on me" without having moved). Keying on
  // the values instead would make that a no-op, since center's reference wouldn't change
  // and @react-google-maps/api only calls map.setCenter() when the center prop's identity changes.
  const center = useMemo(() => ({ lat: location.latitude, lng: location.longitude }), [location]);

  // AdvancedMarkerElement isn't wrapped by @react-google-maps/api (only the deprecated
  // Marker is), so it's created/updated imperatively once the "marker" library is loaded.
  // Re-assigning `.map` every run (not just on creation) matters: under Fast Refresh/dev
  // remounts, the cleanup effect below can null it out while this ref survives, so "ref
  // already exists" doesn't mean "still attached to the map" — re-attaching is idempotent.
  useEffect(() => {
    if (!isLoaded || !map) return;
    if (markerRef.current) {
      markerRef.current.position = center;
      markerRef.current.map = map;
      return;
    }
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: center,
      content: createUserLocationDot(),
    });
  }, [isLoaded, map, center]);

  useEffect(
    () => () => {
      if (markerRef.current) markerRef.current.map = null;
    },
    [],
  );

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { top: padding?.top ?? 0, right: padding?.right ?? 0, bottom: padding?.bottom ?? 0, left: padding?.left ?? 0 },
      ]}
      testID={testID}
    >
      {isLoaded ? (
        <GoogleMap center={center} mapContainerStyle={containerStyle} onDragStart={onUserPan} onLoad={setMap} onUnmount={() => setMap(null)} options={mapOptions} zoom={ZOOM}>
          <Rectangle bounds={SERVICE_AREA_BOUNDS} options={serviceAreaOutlineOptions} />
        </GoogleMap>
      ) : null}
    </View>
  );
}
