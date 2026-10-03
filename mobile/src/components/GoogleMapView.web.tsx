import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { StyleSheet, View } from 'react-native';

import { SERVICE_AREA_BOUNDS } from '../data/serviceArea';
import { useCurrentLocation } from '../hooks/useCurrentLocation';

const ZOOM = 14;
const MIN_ZOOM = 9;

const containerStyle = { width: '100%', height: '100%' };

// Google Maps JS API supports hard pan/zoom restriction natively on web (strictBounds
// disables panning/zooming past it entirely) — no manual clamping needed here, unlike native.
const mapOptions = {
  restriction: {
    latLngBounds: SERVICE_AREA_BOUNDS,
    strictBounds: true,
  },
  minZoom: MIN_ZOOM,
};

type GoogleMapViewProps = {
  testID?: string;
};

/** react-native-maps has no web build; this renders the real Google Maps JS API instead. */
export function GoogleMapView({ testID = 'google-map-view' }: GoogleMapViewProps) {
  const { location } = useCurrentLocation();
  const { isLoaded } = useJsApiLoader({
    id: 'pathly-google-maps-script',
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
  });

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      {isLoaded ? (
        <GoogleMap center={{ lat: location.latitude, lng: location.longitude }} mapContainerStyle={containerStyle} options={mapOptions} zoom={ZOOM} />
      ) : null}
    </View>
  );
}
