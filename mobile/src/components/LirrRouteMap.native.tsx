import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { LirrVehicle } from '../data/lirrLive';
import { PORT_JEFFERSON_STOPS } from '../data/portJeffersonGeometry';

const ROUTE_COORDINATES = PORT_JEFFERSON_STOPS.map((stop) => ({ latitude: stop.lat, longitude: stop.lon }));

// Centered/zoomed to fit the whole Penn Station-to-Port Jefferson branch.
const INITIAL_REGION = {
  latitude: 40.82,
  longitude: -73.52,
  latitudeDelta: 0.35,
  longitudeDelta: 1.1,
};

type LirrRouteMapProps = {
  testID?: string;
  vehicles: readonly LirrVehicle[];
};

/** Real Port Jefferson Branch map: actual station positions, the real line, and live trains. */
export function LirrRouteMap({ testID = 'lirr-route-map', vehicles }: LirrRouteMapProps) {
  return (
    <MapView
      initialRegion={INITIAL_REGION}
      provider={PROVIDER_GOOGLE}
      showsCompass={false}
      showsMyLocationButton={false}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
    >
      <Polyline coordinates={ROUTE_COORDINATES} strokeColor="#A626AA" strokeWidth={4} />
      {PORT_JEFFERSON_STOPS.map((stop) => (
        <Marker key={stop.name} coordinate={{ latitude: stop.lat, longitude: stop.lon }} testID={`lirr-stop-${stop.name}`} title={stop.name} />
      ))}
      {vehicles.map((vehicle) => (
        <Marker key={vehicle.tripId} coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }} pinColor="#0B4F9C" testID={`lirr-vehicle-${vehicle.tripId}`} title="Train" />
      ))}
    </MapView>
  );
}
