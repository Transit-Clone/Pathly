import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { formatAge, visibleTrains } from '../data/liveTrains';
import type { RouteLiveVehicle } from '../data/transitLive';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { Icon } from './Icon';
import type { TransitMode } from './RouteBadge';

type GeometryStop = { stopId?: string; name: string; lat: number; lon: number };

const CENTER_ANCHOR = { x: 0.5, y: 0.5 };
// Street-level span around a focused stop or the rider.
const FOCUS_DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };
const FOCUS_ANIMATION_MS = 400;

// Vehicle marker geometry: the square sits bottom-left of a larger box so the age badge can
// overhang its top-right corner (Android clips marker views to their own bounds).
const VEHICLE_SIZE = 34;
const VEHICLE_BOX = 46;
const VEHICLE_ANCHOR = { x: VEHICLE_SIZE / 2 / VEHICLE_BOX, y: (VEHICLE_BOX - VEHICLE_SIZE / 2) / VEHICLE_BOX };

type RouteMapProps = {
  /** Incremented by the location button; each change centers the map on `userLocation`. */
  centerOnUserRequest?: number;
  color: string;
  /** GTFS direction_id to show vehicles for; all directions when omitted. */
  directionId?: number;
  /** Stop to open zoomed on and emphasize (the rider's nearest), matched by stopId. */
  focusStopId?: string;
  /** Vehicle glyph and label (train vs bus). */
  mode?: TransitMode;
  /** Called when the rider drags the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  /** Detailed track geometry when known (e.g. GTFS shapes); otherwise the line joins the stops. */
  path?: readonly { lat: number; lon: number }[];
  stops: readonly GeometryStop[];
  testID?: string;
  /** Rider's real location; omitted while only the fallback is known. */
  userLocation?: Coordinates;
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

function regionFor(stops: readonly GeometryStop[], focusStop: GeometryStop | undefined): Region {
  return focusStop ? { latitude: focusStop.lat, longitude: focusStop.lon, ...FOCUS_DELTA } : regionForStops(stops);
}

/** Real route map: actual stop positions, the real line, and live vehicles — for any route with a live feed. */
export function RouteMap({ centerOnUserRequest = 0, color, directionId, focusStopId, mode = 'rail', onUserPan, path, stops, testID = 'route-map', userLocation, vehicles }: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const riderMovedMap = useRef(false);
  // True from a location-button press until the rider pans: keeps following fresh GPS fixes.
  const followRider = useRef(false);
  const focusStop = focusStopId ? stops.find((stop) => stop.stopId === focusStopId) : undefined;
  const [initialRegion] = useState(() => regionFor(stops, focusStop));
  // Custom-view stop markers must render at least once with tracking on (Android otherwise can
  // draw them blank), then stop tracking so static dots aren't re-rasterized every frame.
  const [tracksStopViews, setTracksStopViews] = useState(true);
  const now = useNow(1000);
  const shownVehicles = visibleTrains(vehicles, directionId, now);
  const routeCoordinates = (path ?? stops).map((point) => ({ latitude: point.lat, longitude: point.lon }));
  const vehicleLabel = mode === 'bus' ? 'Bus' : 'Train';
  const vehicleIcon = mode === 'bus' ? 'bus' : mode === 'subway' ? 'subway' : 'rail';

  // The nearest stop often resolves after the page opens; follow it until the rider pans.
  useEffect(() => {
    if (!focusStop || riderMovedMap.current) return;
    mapRef.current?.animateToRegion(regionFor(stops, focusStop), FOCUS_ANIMATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stop's identity, not the stops array
  }, [focusStop?.stopId]);

  useEffect(() => {
    if (centerOnUserRequest === 0) return;
    followRider.current = true;
    riderMovedMap.current = true; // the nearest-stop focus must not pull the map back
  }, [centerOnUserRequest]);

  useEffect(() => {
    if (!followRider.current || !userLocation) return;
    mapRef.current?.animateToRegion({ ...userLocation, ...FOCUS_DELTA }, FOCUS_ANIMATION_MS);
  }, [centerOnUserRequest, userLocation]);

  return (
    <MapView
      initialRegion={initialRegion}
      onMapReady={() => setTracksStopViews(false)}
      onPanDrag={() => {
        riderMovedMap.current = true;
        followRider.current = false;
        onUserPan?.();
      }}
      provider={PROVIDER_GOOGLE}
      ref={mapRef}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={true}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
    >
      <Polyline coordinates={routeCoordinates} strokeColor={color} strokeWidth={4} testID="route-line" />
      {stops.map((stop) => {
        const focused = stop === focusStop;
        return (
          <Marker
            key={stop.stopId ?? stop.name}
            anchor={CENTER_ANCHOR}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            testID={`route-stop-${stop.name}`}
            title={stop.name}
            tracksViewChanges={tracksStopViews}
            zIndex={focused ? 1 : 0}
          >
            <View style={[styles.stopDot, { borderColor: color }, focused && [styles.focusedStopDot, { backgroundColor: color }]]} testID={`route-dot-${stop.name}`} />
          </Marker>
        );
      })}
      {shownVehicles.map((vehicle) => (
        // Vehicles keep tracking view changes so the ticking age badge re-renders; there are only a few.
        <Marker key={vehicle.tripId} anchor={VEHICLE_ANCHOR} coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }} testID={`route-vehicle-${vehicle.tripId}`} title={vehicleLabel} zIndex={2}>
          <View style={styles.vehicleBox}>
            <View style={[styles.vehicleBadge, { backgroundColor: color }]} testID={`route-vehicle-badge-${vehicle.tripId}`}>
              <Icon color="#FFFFFF" filled={true} name={vehicleIcon} size={18} />
            </View>
            {vehicle.updatedAt != null ? (
              <View style={[styles.ageBadge, { borderColor: color }]}>
                <Text style={styles.ageText} testID={`route-vehicle-age-${vehicle.tripId}`}>{formatAge(now - vehicle.updatedAt)}</Text>
              </View>
            ) : null}
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  stopDot: {
    width: 14,
    height: 14,
    borderWidth: 3,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  // The rider's nearest stop: larger and filled, with a white ring.
  focusedStopDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: '#FFFFFF',
  },
  vehicleBox: {
    width: VEHICLE_BOX,
    height: VEHICLE_BOX,
  },
  // Rounded square with a mode glyph: a different shape from the round stop dots, so a
  // vehicle can never be mistaken for a stop.
  vehicleBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: VEHICLE_SIZE,
    height: VEHICLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 9,
    borderColor: '#FFFFFF',
  },
  ageBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  ageText: {
    color: '#1F2937',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 9,
  },
});
