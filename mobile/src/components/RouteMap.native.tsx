import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { formatAge, visibleTrains } from '../data/liveTrains';
import { googleMapStyle } from '../data/mapStyle';
import { bearingToNextStop, splitIndexAtStop, withAlpha } from '../data/routeDirection';
import type { RouteLiveVehicle } from '../data/transitLive';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { useTheme } from '../theme/AppSettings';
import { Icon } from './Icon';
import type { TransitMode } from './RouteBadge';

type GeometryStop = { stopId?: string; name: string; lat: number; lon: number };

const CENTER_ANCHOR = { x: 0.5, y: 0.5 };
// Street-level span around a focused stop or the rider.
const FOCUS_DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };
const FOCUS_ANIMATION_MS = 400;
const ROUTE_FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
// The line behind the rider's stop (already travelled in this direction) is drawn faint.
const BEHIND_LINE_ALPHA = 0.35;
const ARROW_SIZE = 22;
// Stop dots are exactly as wide as the line, so they sit inside it like beads instead of
// bulging out of it. Only the rider's own stop is drawn larger, so it stands out.
const LINE_WIDTH = 8;
const STOP_RING = 1.5;
// The direction arrow sits this far out from the rider's stop (screen points, so it hugs the dot
// at any zoom): a tall transparent box anchored at the stop, with the arrow at its far end.
const ARROW_REACH = 48;
const ARROW_BOTTOM_ANCHOR = { x: 0.5, y: 1 };

// Vehicle marker geometry: the circle sits bottom-left of a larger box so the age badge can
// overhang its top-right corner (Android clips marker views to their own bounds).
const VEHICLE_SIZE = 42;
const VEHICLE_BOX = 54;
const VEHICLE_ANCHOR = { x: VEHICLE_SIZE / 2 / VEHICLE_BOX, y: (VEHICLE_BOX - VEHICLE_SIZE / 2) / VEHICLE_BOX };

type RouteMapProps = {
  /** Incremented by the location button; each change centers the map on `userLocation` and follows it until a pan. */
  centerOnUserRequest?: number;
  /** Incremented by the route-overview button; each change fits the map to the whole line. */
  showRouteRequest?: number;
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
export function RouteMap({ centerOnUserRequest = 0, color, directionId, focusStopId, mode = 'rail', onUserPan, path, showRouteRequest = 0, stops, testID = 'route-map', userLocation, vehicles }: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  // Places hidden, and recolored in the dark theme (see mapStyle.ts).
  const { isDark } = useTheme();
  const mapStyle = useMemo(() => googleMapStyle(isDark), [isDark]);
  const riderMovedMap = useRef(false);
  // True from a location-button press until the rider pans (or asks for the whole route): keeps
  // following fresh GPS fixes.
  const followRider = useRef(false);
  const focusStop = focusStopId ? stops.find((stop) => stop.stopId === focusStopId) : undefined;
  const [initialRegion] = useState(() => regionFor(stops, focusStop));
  // Custom-view stop markers must render at least once with tracking on (Android otherwise can
  // draw them blank), then stop tracking so static dots aren't re-rasterized every frame.
  const [tracksStopViews, setTracksStopViews] = useState(true);
  const now = useNow(1000);
  const shownVehicles = visibleTrains(vehicles, directionId, now);
  // Split at the rider's stop: faint behind it, full strength ahead, with an arrow toward the next stop.
  const line = useMemo(() => {
    const points = path ?? stops;
    const toCoordinates = (part: readonly { lat: number; lon: number }[]) => part.map((point) => ({ latitude: point.lat, longitude: point.lon }));
    const focusIndex = focusStop ? stops.indexOf(focusStop) : -1;
    if (focusIndex < 0) return { behind: [], ahead: toCoordinates(points), bearing: null };
    const split = splitIndexAtStop(points, stops, focusIndex);
    return { behind: toCoordinates(points.slice(0, split + 1)), ahead: toCoordinates(points.slice(split)), bearing: bearingToNextStop(stops, focusIndex) };
  }, [focusStop, path, stops]);
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

  // The route-overview button frames the whole line in this direction (every stop), clear of the
  // controls over the map's top and the page edge at its bottom.
  useEffect(() => {
    if (showRouteRequest === 0) return;
    followRider.current = false;
    riderMovedMap.current = true; // the nearest-stop focus must not pull the map back
    const points = (path ?? stops).map((point) => ({ latitude: point.lat, longitude: point.lon }));
    mapRef.current?.fitToCoordinates(points, { edgePadding: ROUTE_FIT_PADDING, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request only; the line is read at request time
  }, [showRouteRequest]);

  return (
    <MapView
      initialRegion={initialRegion}
      onMapReady={() => setTracksStopViews(false)}
      onPanDrag={() => {
        riderMovedMap.current = true;
        followRider.current = false;
        onUserPan?.();
      }}
      customMapStyle={mapStyle}
      provider={PROVIDER_GOOGLE}
      ref={mapRef}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={true}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
    >
      {line.behind.length > 1 ? <Polyline coordinates={line.behind} strokeColor={withAlpha(color, BEHIND_LINE_ALPHA)} strokeWidth={LINE_WIDTH} testID="route-line-behind" zIndex={0} /> : null}
      <Polyline coordinates={line.ahead} strokeColor={color} strokeWidth={LINE_WIDTH} testID="route-line" zIndex={1} />
      {line.bearing != null && focusStop ? (
        // One arrow right beside the rider's stop, pointing at the next stop. The box is
        // anchored at the stop and turned to that bearing (`flat`, so it turns with the map); the
        // arrow sits at the box's far end, and the chevron glyph (pointing east) is turned upright.
        <Marker
          anchor={ARROW_BOTTOM_ANCHOR}
          coordinate={{ latitude: focusStop.lat, longitude: focusStop.lon }}
          flat={true}
          rotation={line.bearing}
          tappable={false}
          testID="route-direction-arrow"
          tracksViewChanges={tracksStopViews}
          zIndex={3}
        >
          <View pointerEvents="none" style={styles.arrowReach}>
            <View style={[styles.arrow, { backgroundColor: color }]}>
              <Icon color="#FFFFFF" name="forward" size={17} style={styles.arrowGlyph} />
            </View>
          </View>
        </Marker>
      ) : null}
      {stops.map((stop, stopIndex) => {
        const focused = stop === focusStop;
        // Stops behind the rider's stop in this direction fade with the line behind it.
        const passed = focusStop != null && stopIndex < stops.indexOf(focusStop);
        return (
          <Marker
            key={`${stop.stopId ?? stop.name}-${stopIndex}`}
            anchor={CENTER_ANCHOR}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            testID={`route-stop-${stop.name}`}
            title={stop.name}
            tracksViewChanges={tracksStopViews}
            zIndex={focused ? 1 : 0}
          >
            <View style={[styles.stopDot, { borderColor: passed ? withAlpha(color, BEHIND_LINE_ALPHA) : color }, focused && [styles.focusedStopDot, { backgroundColor: color }]]} testID={`route-dot-${stop.name}`} />
          </Marker>
        );
      })}
      {shownVehicles.map((vehicle) => (
        // Vehicles keep tracking view changes so the ticking age badge re-renders; there are only a few.
        <Marker key={vehicle.tripId} anchor={VEHICLE_ANCHOR} coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }} testID={`route-vehicle-${vehicle.tripId}`} title={vehicleLabel} zIndex={2}>
          <View style={styles.vehicleBox}>
            <View style={styles.vehicleBadge} testID={`route-vehicle-badge-${vehicle.tripId}`}>
              <Icon color={color} filled={true} name={vehicleIcon} size={22} />
            </View>
            {vehicle.updatedAt != null ? (
              <View style={[styles.ageBadge, { backgroundColor: color }]} testID={`route-vehicle-age-badge-${vehicle.tripId}`}>
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
    width: LINE_WIDTH,
    height: LINE_WIDTH,
    borderWidth: STOP_RING,
    borderRadius: LINE_WIDTH / 2,
    backgroundColor: '#FFFFFF',
  },
  // The rider's nearest stop: larger and filled, with a white ring.
  focusedStopDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: '#FFFFFF',
  },
  arrowReach: {
    width: ARROW_SIZE,
    height: ARROW_REACH,
    alignItems: 'center',
  },
  arrowGlyph: {
    transform: [{ rotate: '-90deg' }],
  },
  arrow: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: ARROW_SIZE / 2,
    shadowColor: '#16324F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  vehicleBox: {
    width: VEHICLE_BOX,
    height: VEHICLE_BOX,
  },
  // Borderless white circle with a route-color glyph: three times a stop dot's size and carrying
  // the mode glyph (stop dots never do), so a vehicle reads apart from a stop.
  vehicleBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: VEHICLE_SIZE,
    height: VEHICLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VEHICLE_SIZE / 2,
    backgroundColor: '#FFFFFF',
    // With no outline, the shadow is what keeps the white circle visible on pale map tiles.
    shadowColor: '#16324F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
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
    borderRadius: 12,
  },
  ageText: {
    color: '#FFFFFF',
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 9,
  },
});
