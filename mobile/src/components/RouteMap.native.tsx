import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

import { BeanAvatar } from '../avatars/BeanAvatarImage';
import { formatAge, visibleTrains } from '../data/liveTrains';
import { googleMapStyle } from '../data/mapStyle';
import { approachingVehicle, directionArrowAt, focusStopIndex, metersPerPixel, riderNearStop, splitPathAtStop, withAlpha } from '../data/routeDirection';
import { stopRevealZoom, zoomForRegion } from '../data/stopDeclutter';
import type { RouteLiveVehicle } from '../data/transitLive';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { useTheme } from '../theme/AppSettings';
import { Icon } from './Icon';
import { NATIVE_MAP_PROVIDER } from './mapProvider';
import type { TransitMode } from './RouteBadge';
import { HeadingBeamMarker } from './HeadingBeamMarker';
import { Glide } from '../hooks/useGlide';
import { DirectionArrow } from './DirectionArrow';

type GeometryStop = { stopId?: string; name: string; lat: number; lon: number };

const CENTER_ANCHOR = { x: 0.5, y: 0.5 };
// Street-level span around a focused stop or the rider.
const FOCUS_DELTA = { latitudeDelta: 0.06, longitudeDelta: 0.06 };
const FOCUS_ANIMATION_MS = 400;
const ROUTE_FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
// The line behind the rider's stop (already travelled in this direction) is drawn faint.
const BEHIND_LINE_ALPHA = 0.35;
// Stop dots are exactly as wide as the line, so they sit inside it like beads instead of
// bulging out of it. Only the rider's own stop is drawn larger, so it stands out.
const LINE_WIDTH = 8;
// The walk to the stop, matching TripMap.native.tsx's walking legs.
// Walks are plain round gray dots, which read from far out over any street.
const WALK_WIDTH = 6;
const WALK_DASH = [1, 10];
const STOP_RING = 1.5;

// Vehicle marker geometry: the circle sits bottom-left of a larger box so the age badge can
// overhang its top-right corner (Android clips marker views to their own bounds).
const VEHICLE_SIZE = 42;
const VEHICLE_BOX = 54;
const VEHICLE_ANCHOR = { x: VEHICLE_SIZE / 2 / VEHICLE_BOX, y: (VEHICLE_BOX - VEHICLE_SIZE / 2) / VEHICLE_BOX };
// Riders' avatars replace the age badge, stacked; the box widens so Android doesn't clip them.
const RIDER_AVATAR = 24;
const RIDER_AVATAR_STEP = 13;
const RIDER_AVATAR_LEFT = 30;
const RIDER_DISC_INSET = 2;

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
  /** Matches the rider's stop by name when its id isn't in `stops` (see focusStopIndex). */
  focusStopName?: string;
  /** Vehicle glyph and label (train vs bus). */
  mode?: TransitMode;
  /** Tapping a live vehicle opens its details. */
  onVehiclePress?: (tripId: string) => void;
  /** Tapping a stop's name (shown once its dot is tapped) opens the line at that stop. */
  onOpenStop?: (stop: GeometryStop) => void;
  /** Called when the rider drags the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  /** Detailed track geometry when known (e.g. GTFS shapes); otherwise the line joins the stops. */
  path?: readonly { lat: number; lon: number }[];
  stops: readonly GeometryStop[];
  testID?: string;
  /** Rider's real location; omitted while only the fallback is known. */
  userLocation?: Coordinates;
  vehicles: readonly RouteLiveVehicle[];
  /** The walk along the streets from the rider to the focused stop, drawn dotted (as on the trip map). */
  walkPath?: readonly { lat: number; lon: number }[];
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

/**
 * A live vehicle (Route View and the trip map): a white circle with the line's mode glyph and its
 * position's age, gliding to each refreshed spot rather than jumping there.
 */
export function LiveVehicleMarker({ color, mode, now, onPress, vehicle, zIndex }: { color: string; mode: TransitMode; now: number; onPress?: (tripId: string) => void; vehicle: RouteLiveVehicle; zIndex: number }) {
  const avatars = vehicle.riders?.avatars ?? [];
  const boxWidth = avatars.length > 0 ? RIDER_AVATAR_LEFT + RIDER_AVATAR + (avatars.length - 1) * RIDER_AVATAR_STEP : VEHICLE_BOX;
  const anchor = { x: VEHICLE_SIZE / 2 / boxWidth, y: VEHICLE_ANCHOR.y };
  return (
    <Glide lat={vehicle.lat} lon={vehicle.lon}>{(point) => (
      // Vehicles keep tracking view changes so the ticking age badge re-renders; there are only a few.
      <Marker anchor={anchor} coordinate={{ latitude: point.lat, longitude: point.lon }} onPress={onPress ? () => onPress(vehicle.tripId) : undefined} testID={`route-vehicle-${vehicle.tripId}`} title={onPress ? undefined : mode === 'bus' ? 'Bus' : 'Train'} zIndex={zIndex}>
        <View style={[styles.vehicleBox, { width: boxWidth }]}>
          <View style={styles.vehicleBadge} testID={`route-vehicle-badge-${vehicle.tripId}`}>
            <Icon color={color} name={mode === 'bus' ? 'bus' : mode === 'subway' ? 'subway' : mode === 'ferry' ? 'ferry' : 'rail'} size={22} />
          </View>
          {avatars.length > 0 ? avatars.map((avatar, index) => (
            // The first (the rider's own) on top; the white disc keeps each apart from its neighbor.
            <View key={index} style={[styles.riderAvatar, { left: RIDER_AVATAR_LEFT + index * RIDER_AVATAR_STEP, zIndex: avatars.length - index }]}>
              <BeanAvatar config={avatar} size={RIDER_AVATAR - RIDER_DISC_INSET * 2} testID={`route-vehicle-rider-${vehicle.tripId}-${index}`} />
            </View>
          )) : vehicle.updatedAt != null ? (
            <View style={[styles.ageBadge, { backgroundColor: color }]} testID={`route-vehicle-age-badge-${vehicle.tripId}`}>
              <Text style={styles.ageText} testID={`route-vehicle-age-${vehicle.tripId}`}>{formatAge(now - vehicle.updatedAt)}</Text>
            </View>
          ) : null}
        </View>
      </Marker>
    )}</Glide>
  );
}

/** Real route map: actual stop positions, the real line, and live vehicles — for any route with a live feed. */
export function RouteMap({ centerOnUserRequest = 0, color, directionId, focusStopId, focusStopName, mode = 'rail', onOpenStop, onUserPan, onVehiclePress, path, showRouteRequest = 0, stops, testID = 'route-map', userLocation, vehicles, walkPath }: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  // Places hidden, and recolored in the dark theme (see mapStyle.ts).
  const { colors, isDark } = useTheme();
  const mapStyle = useMemo(() => googleMapStyle(isDark), [isDark]);
  const riderMovedMap = useRef(false);
  // True from a location-button press until the rider pans (or asks for the whole route): keeps
  // following fresh GPS fixes.
  const followRider = useRef(false);
  const focusStop = stops[focusStopIndex(stops, focusStopId, focusStopName)];
  const [initialRegion] = useState(() => regionFor(stops, focusStop));
  // Custom-view stop markers must render at least once with tracking on (Android otherwise can
  // draw them blank), then stop tracking so static dots aren't re-rasterized every frame.
  const [tracksStopViews, setTracksStopViews] = useState(true);
  // Stop dots are drawn only once they're zoomed apart (stopDeclutter.ts); the rider's stop always is.
  const [mapWidth, setMapWidth] = useState(0);
  // Before the map's own layout arrives, the window's width stands in.
  const { width: windowWidth } = useWindowDimensions();
  const [zoom, setZoom] = useState(() => zoomForRegion(initialRegion.longitudeDelta, windowWidth));
  const revealZoom = useMemo(() => stopRevealZoom(stops.map((stop) => ({ lat: stop.lat, lng: stop.lon }))), [stops]);
  const dotsShown = zoom >= revealZoom;
  // Dots shown again are new markers: they render once with tracking on, like on first load.
  const [trackedDotsShown, setTrackedDotsShown] = useState(dotsShown);
  if (dotsShown !== trackedDotsShown) {
    setTrackedDotsShown(dotsShown);
    if (dotsShown) setTracksStopViews(true);
  }
  useEffect(() => {
    if (!tracksStopViews || !dotsShown) return undefined;
    const timer = setTimeout(() => setTracksStopViews(false), 500);
    return () => clearTimeout(timer);
  }, [dotsShown, tracksStopViews]);
  const now = useNow(1000);
  // The arrow's drawing only needs snapshotting once (and again when the line's color changes).
  const [arrowDrawnIn, setArrowDrawnIn] = useState<string | null>(null);
  const tracksArrowView = arrowDrawnIn !== color;
  useEffect(() => {
    const timer = setTimeout(() => setArrowDrawnIn(color), 500);
    return () => clearTimeout(timer);
  }, [color]);
  const shownVehicles = visibleTrains(vehicles, directionId, now);
  // Split at the rider's stop: faint behind it, full strength ahead.
  const line = useMemo(() => {
    const points = path ?? stops;
    const toCoordinates = (part: readonly { lat: number; lon: number }[]) => part.map((point) => ({ latitude: point.lat, longitude: point.lon }));
    const focusIndex = focusStop ? stops.indexOf(focusStop) : -1;
    if (focusIndex < 0) return { behind: [], ahead: toCoordinates(points), aheadPoints: [], behindPoints: [] };
    const { behind, ahead } = splitPathAtStop(points, stops, focusIndex);
    return { behind: toCoordinates(behind), ahead: toCoordinates(ahead), aheadPoints: ahead, behindPoints: behind };
  }, [focusStop, path, stops]);
  // Placed once, for the zoom the map opens at, so zooming never moves it. Zoomed out well past that,
  // the line's bends would reach it, so it's hidden there instead.
  const [arrowZoom] = useState(() => Math.round(zoom));
  const arrow = useMemo(() => {
    const start = line.aheadPoints[0];
    return start && arrowZoom > 0 ? directionArrowAt(line.aheadPoints, metersPerPixel(arrowZoom, start.lat)) : null;
  }, [arrowZoom, line.aheadPoints]);

  // The rider, when they're near their stop: framed with it so they see the walk there.
  const nearRider = userLocation && focusStop && riderNearStop(userLocation, focusStop) ? userLocation : null;
  // Set once the map has framed an approaching vehicle (below).
  const framedVehicle = useRef(false);
  // The nearest stop (and whether the rider is near it) often resolves after the page opens; follow
  // them until the rider pans. Keyed on near/far, not every GPS fix.
  useEffect(() => {
    if (!focusStop || riderMovedMap.current || framedVehicle.current) return;
    if (nearRider) {
      mapRef.current?.fitToCoordinates([{ latitude: focusStop.lat, longitude: focusStop.lon }, nearRider], { edgePadding: ROUTE_FIT_PADDING, animated: true });
      return;
    }
    mapRef.current?.animateToRegion(regionFor(stops, focusStop), FOCUS_ANIMATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stop's identity and the rider being near
  }, [focusStop?.stopId, nearRider != null]);

  // Once a live vehicle shows up on its way to the rider's stop, the map glides out (once) to show
  // the stop and that vehicle (and the rider, when they're near the stop), unless the rider has
  // moved the map already.
  useEffect(() => {
    if (framedVehicle.current || riderMovedMap.current || !focusStop) return;
    const vehicle = approachingVehicle(line.behindPoints, shownVehicles);
    if (!vehicle) return;
    framedVehicle.current = true;
    mapRef.current?.fitToCoordinates([
      { latitude: focusStop.lat, longitude: focusStop.lon },
      { latitude: vehicle.lat, longitude: vehicle.lon },
      ...(nearRider ? [nearRider] : []),
    ], { edgePadding: ROUTE_FIT_PADDING, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-checked as vehicles report; the rest is read then
  }, [focusStop?.stopId, vehicles]);

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
      onLayout={(event: LayoutChangeEvent) => setMapWidth(event.nativeEvent.layout.width)}
      onMapReady={() => setTracksStopViews(false)}
      onPanDrag={() => {
        riderMovedMap.current = true;
        followRider.current = false;
        onUserPan?.();
      }}
      onRegionChangeComplete={(region: Region) => setZoom(zoomForRegion(region.longitudeDelta, mapWidth || windowWidth))}
      customMapStyle={mapStyle}
      provider={NATIVE_MAP_PROVIDER}
      ref={mapRef}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={true}
      style={StyleSheet.absoluteFill}
      testID={testID}
      toolbarEnabled={false}
      userInterfaceStyle={isDark ? 'dark' : 'light'}
    >
      {line.behind.length > 1 ? <Polyline coordinates={line.behind} strokeColor={withAlpha(color, BEHIND_LINE_ALPHA)} strokeWidth={LINE_WIDTH} testID="route-line-behind" zIndex={0} /> : null}
      <Polyline coordinates={line.ahead} strokeColor={color} strokeWidth={LINE_WIDTH} testID="route-line" zIndex={1} />
      {walkPath && walkPath.length > 1 ? (
        // The walk to the stop, dotted like TripMap.native.tsx's walking legs.
        <>
          <Polyline
            coordinates={walkPath.map((point) => ({ latitude: point.lat, longitude: point.lon }))}
            lineCap="round"
            lineDashPattern={WALK_DASH}
            strokeColor={colors.mutedInk}
            strokeWidth={WALK_WIDTH}
            testID="route-walk"
            zIndex={2}
          />
        </>
      ) : null}
      {stops.map((stop, stopIndex) => {
        const focused = stop === focusStop;
        if (!focused && !dotsShown) return null;
        // Stops behind the rider's stop in this direction fade with the line behind it.
        const passed = focusStop != null && stopIndex < stops.indexOf(focusStop);
        return (
          <Marker
            key={`${stop.stopId ?? stop.name}-${stopIndex}`}
            anchor={CENTER_ANCHOR}
            coordinate={{ latitude: stop.lat, longitude: stop.lon }}
            testID={`route-stop-${stop.name}`}
            onCalloutPress={onOpenStop ? () => onOpenStop(stop) : undefined}
            title={stop.name}
            tracksViewChanges={tracksStopViews}
            zIndex={focused ? 1 : 0}
          >
            <View style={[styles.stopDot, { borderColor: passed ? withAlpha(color, BEHIND_LINE_ALPHA) : color }, focused && [styles.focusedStopDot, { borderColor: color }]]} testID={`route-dot-${stop.name}`} />
          </Marker>
        );
      })}
      {arrow && zoom >= arrowZoom - 1 ? (
        // Which way the line runs, beside it just past the rider's stop. Flat, so it turns with the map.
        <Marker
          anchor={{ x: 0.5, y: 0.5 }}
          coordinate={{ latitude: arrow.point.lat, longitude: arrow.point.lon }}
          flat={true}
          rotation={arrow.bearing}
          tappable={false}
          testID="route-direction-arrow"
          tracksViewChanges={tracksArrowView}
          zIndex={1}
        >
          <DirectionArrow color={color} />
        </Marker>
      ) : null}
      {shownVehicles.map((vehicle) => <LiveVehicleMarker key={vehicle.tripId} color={color} mode={mode} now={now} onPress={onVehiclePress} vehicle={vehicle} zIndex={2} />)}
      {userLocation ? <HeadingBeamMarker coordinate={userLocation} /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  stopDot: {
    width: LINE_WIDTH,
    height: LINE_WIDTH,
    borderWidth: STOP_RING,
    borderRadius: LINE_WIDTH / 2,
    // Stop dots stay white in dark mode too.
    backgroundColor: '#FFFFFF',
  },
  // The rider's nearest stop: larger, white, with a thick ring in the route color.
  focusedStopDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
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
  riderAvatar: {
    position: 'absolute',
    top: 0,
    width: RIDER_AVATAR,
    height: RIDER_AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RIDER_AVATAR / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#16324F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
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
