import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import type { RouteLiveVehicle } from '../data/transitLive';

type GeometryStop = { name: string; lat: number; lon: number };

const containerStyle = { width: '100%', height: '100%' };
const mapOptions = { disableDefaultUI: true };
// Arbitrary point; immediately replaced by fitBounds once the map and stops are both ready.
const FALLBACK_CENTER = { lat: 40.75, lng: -73.95 };

type RouteMapProps = {
  color: string;
  stops: readonly GeometryStop[];
  testID?: string;
  vehicles: readonly RouteLiveVehicle[];
};

/** Real route map: actual station positions, the real line, and live trains — used for any route with a live feed, not just one. */
export function RouteMap({ color, stops, testID = 'route-map', vehicles }: RouteMapProps) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const routePath = useMemo(() => stops.map((stop) => ({ lat: stop.lat, lng: stop.lon })), [stops]);
  const polylineOptions = useMemo(() => ({ strokeColor: color, strokeWeight: 4 }), [color]);

  // Fits every stop, with some breathing room around the edges — runs once the map is ready,
  // not on every render, since fitBounds is a one-shot camera move, not a controlled prop.
  const onLoad = useCallback((map: google.maps.Map) => {
    const bounds = new google.maps.LatLngBounds();
    for (const stop of stops) bounds.extend({ lat: stop.lat, lng: stop.lon });
    map.fitBounds(bounds, 32);
  }, [stops]);

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      {isLoaded ? (
        <GoogleMap center={FALLBACK_CENTER} mapContainerStyle={containerStyle} onLoad={onLoad} options={mapOptions} zoom={9}>
          <Polyline options={polylineOptions} path={routePath} />
          {stops.map((stop) => (
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
