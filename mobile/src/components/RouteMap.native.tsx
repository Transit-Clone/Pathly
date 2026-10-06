import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import type { RouteLiveVehicle } from '../data/transitLive';

type GeometryStop = { name: string; lat: number; lon: number };

type RouteMapProps = {
  color: string;
  stops: readonly GeometryStop[];
  testID?: string;
  vehicles: readonly RouteLiveVehicle[];
};

/** Centers/zooms to fit every stop, with some breathing room around the edges. */
function regionForStops(stops: readonly GeometryStop[]): Region {
  const lats = stops.map((stop) => stop.lat);
  const lons = stops.map((stop) => stop.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.05),
    longitudeDelta: Math.max((maxLon - minLon) * 1.3, 0.05),
  };
}

/** Real route map: actual station positions, the real line, and live trains — used for any route with a live feed, not just one. */
export function RouteMap({ color, stops, testID = 'route-map', vehicles }: RouteMapProps) {
  const routeCoordinates = stops.map((stop) => ({ latitude: stop.lat, longitude: stop.lon }));

  return (
    <MapView
      initialRegion={regionForStops(stops)}
      provider={PROVIDER_GOOGLE}
      showsCompass={false}
      showsMyLocationButton={false}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
    >
      <Polyline coordinates={routeCoordinates} strokeColor={color} strokeWidth={4} />
      {stops.map((stop) => (
        <Marker key={stop.name} coordinate={{ latitude: stop.lat, longitude: stop.lon }} testID={`route-stop-${stop.name}`} title={stop.name} />
      ))}
      {vehicles.map((vehicle) => (
        <Marker key={vehicle.tripId} coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }} pinColor="#0B4F9C" testID={`route-vehicle-${vehicle.tripId}`} title="Train" />
      ))}
    </MapView>
  );
}
