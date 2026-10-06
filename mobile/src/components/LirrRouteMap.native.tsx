import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { LirrVehicle } from '../data/lirrLive';
import { formatAge, visibleTrains } from '../data/liveTrains';
import type { LiveStop } from '../data/nearestStop';
import { PORT_JEFFERSON_STOPS } from '../data/portJeffersonGeometry';
import { PORT_JEFFERSON_SHAPE } from '../data/portJeffersonShape';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { Icon } from './Icon';

// Real track geometry (GTFS shapes), not straight lines between stations.
const ROUTE_COORDINATES = PORT_JEFFERSON_SHAPE.map((point) => ({ latitude: point.lat, longitude: point.lon }));
const CENTER_ANCHOR = { x: 0.5, y: 0.5 };

// Whole branch, used until a focus stop is known.
const BRANCH_REGION = {
  latitude: 40.82,
  longitude: -73.52,
  latitudeDelta: 0.35,
  longitudeDelta: 1.1,
};
// Street-level span around the rider's nearest station.
const FOCUS_DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };
const FOCUS_ANIMATION_MS = 400;

// Train marker geometry: the square sits bottom-left of a larger box so the age badge can
// overhang its top-right corner (Android clips marker views to their own bounds).
const TRAIN_SIZE = 34;
const TRAIN_BOX = 46;
const TRAIN_ANCHOR = { x: TRAIN_SIZE / 2 / TRAIN_BOX, y: (TRAIN_BOX - TRAIN_SIZE / 2) / TRAIN_BOX };

type LirrRouteMapProps = {
  /** Incremented by the location button; each change centers the map on `userLocation`. */
  centerOnUserRequest?: number;
  color: string;
  /** GTFS direction_id to show trains for; all directions when omitted. */
  directionId?: number;
  /** Station to open zoomed on and emphasize (the rider's nearest). */
  focusStop?: LiveStop;
  /** Called when the rider drags the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  testID?: string;
  /** Rider's real location; omitted while only the fallback is known. */
  userLocation?: Coordinates;
  vehicles: readonly LirrVehicle[];
};

function regionFor(stop: LiveStop | undefined) {
  return stop ? { latitude: stop.lat, longitude: stop.lon, ...FOCUS_DELTA } : BRANCH_REGION;
}

/** Real Port Jefferson Branch map: actual station positions, the real line, and live trains. */
export function LirrRouteMap({ centerOnUserRequest = 0, color, directionId, focusStop, onUserPan, testID = 'lirr-route-map', userLocation, vehicles }: LirrRouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const riderMovedMap = useRef(false);
  // True from a location-button press until the rider pans: keeps following fresh GPS fixes.
  const followRider = useRef(false);
  const [initialRegion] = useState(() => regionFor(focusStop));
  // Custom-view stop markers must render at least once with tracking on (Android otherwise can
  // draw them blank), then stop tracking so 22 static dots aren't re-rasterized every frame.
  const [tracksStopViews, setTracksStopViews] = useState(true);
  const now = useNow(1000);
  const trains = visibleTrains(vehicles, directionId, now);

  // GPS often resolves after the page opens; follow the new nearest station until the rider pans.
  useEffect(() => {
    if (!focusStop || riderMovedMap.current) return;
    mapRef.current?.animateToRegion(regionFor(focusStop), FOCUS_ANIMATION_MS);
  }, [focusStop]);

  useEffect(() => {
    if (centerOnUserRequest === 0) return;
    followRider.current = true;
    riderMovedMap.current = true; // the nearest-station focus must not pull the map back
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
      <Polyline coordinates={ROUTE_COORDINATES} strokeColor={color} strokeWidth={4} testID="lirr-route-line" />
      {PORT_JEFFERSON_STOPS.map((stop) => {
        const focused = stop.name === focusStop?.name;
        return (
          <Marker
            key={stop.name}
            anchor={CENTER_ANCHOR}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            testID={`lirr-stop-${stop.name}`}
            title={stop.name}
            tracksViewChanges={tracksStopViews}
            zIndex={focused ? 1 : 0}
          >
            <View style={[styles.stopDot, { borderColor: color }, focused && [styles.focusedStopDot, { backgroundColor: color }]]} testID={`lirr-dot-${stop.name}`} />
          </Marker>
        );
      })}
      {trains.map((vehicle) => (
        // Trains keep tracking view changes so the ticking age badge re-renders; there are only a few.
        <Marker key={vehicle.tripId} anchor={TRAIN_ANCHOR} coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }} testID={`lirr-vehicle-${vehicle.tripId}`} title="Train" zIndex={2}>
          <View style={styles.trainBox}>
            <View style={[styles.trainBadge, { backgroundColor: color }]} testID={`lirr-train-badge-${vehicle.tripId}`}>
              <Icon color="#FFFFFF" filled={true} name="rail" size={18} />
            </View>
            {vehicle.updatedAt != null ? (
              <View style={[styles.ageBadge, { borderColor: color }]}>
                <Text style={styles.ageText} testID={`lirr-train-age-${vehicle.tripId}`}>{formatAge(now - vehicle.updatedAt)}</Text>
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
  // The rider's nearest station: larger and filled, with a white ring.
  focusedStopDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: '#FFFFFF',
  },
  trainBox: {
    width: TRAIN_BOX,
    height: TRAIN_BOX,
  },
  // Rounded square with a train glyph: a different shape from the round stop dots, so a
  // train can never be mistaken for a station.
  trainBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: TRAIN_SIZE,
    height: TRAIN_SIZE,
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
