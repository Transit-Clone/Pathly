import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import type { LirrVehicle } from '../data/lirrLive';
import { PORT_JEFFERSON_STOPS } from '../data/portJeffersonGeometry';

// Fits the whole Penn Station-to-Port Jefferson branch, not just the local segment.
const ZOOM = 9;
const containerStyle = { width: '100%', height: '100%' };
const CENTER = { lat: 40.82, lng: -73.52 };
const ROUTE_PATH = PORT_JEFFERSON_STOPS.map((stop) => ({ lat: stop.lat, lng: stop.lon }));
const polylineOptions = { strokeColor: '#A626AA', strokeWeight: 4 };
const mapOptions = { disableDefaultUI: true };

type LirrRouteMapProps = {
  testID?: string;
  vehicles: readonly LirrVehicle[];
};

/** Real Port Jefferson Branch map: actual station positions, the real line, and live trains. */
export function LirrRouteMap({ testID = 'lirr-route-map', vehicles }: LirrRouteMapProps) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      {isLoaded ? (
        <GoogleMap center={CENTER} mapContainerStyle={containerStyle} options={mapOptions} zoom={ZOOM}>
          <Polyline options={polylineOptions} path={ROUTE_PATH} />
          {PORT_JEFFERSON_STOPS.map((stop) => (
            <Marker key={stop.name} position={{ lat: stop.lat, lng: stop.lon }} title={stop.name} />
          ))}
          {vehicles.map((vehicle) => (
            <Marker key={vehicle.tripId} position={{ lat: vehicle.lat, lng: vehicle.lon }} title="Train" />
          ))}
        </GoogleMap>
      ) : null}
    </View>
  );
}
