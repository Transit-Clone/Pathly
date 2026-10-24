import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';

import { googleMapStyle } from '../data/mapStyle';
import { zoomForRegion } from '../data/stopDeclutter';
import { stopIndexAt, tripMapPoints, viaRevealZooms, type TripMapProps, type TripMapStop } from '../data/tripMap';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { CurrentLocationMarker } from './CurrentLocationMarker';

const FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
const TRANSIT_WIDTH = 6;
const WALK_WIDTH = 4;
const WALK_DASH = [2, 8];
const FOCUS_ZOOM = 15;
const FOCUS_DURATION_MS = 350;

type ProgressState = 'completed' | 'current' | 'upcoming';

/**
 * A planned trip on a real map: each leg in its line's color, walking dotted, a marker at every
 * stop. Interactive maps pan and zoom, label a tapped stop, and offer to re-frame the whole trip.
 */
export function TripMap({ centerOnUserRequest = 0, destination, focusStop, followLocation, followUser, interactive = false, itinerary, navigationProgress, onFollowModeChange, onUserPan, origin, padding = FIT_PADDING, testID = 'trip-map', userLocation, userLocationStale = false }: TripMapProps) {
  const mapRef = useRef<MapView>(null);
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  const mapStyle = useMemo(() => googleMapStyle(isDark), [isDark]);
  const trip = useMemo(() => tripMapPoints(itinerary, origin, destination), [destination, itinerary, origin]);
  const legs = navigationProgress?.segments ?? trip.legs;
  const progressStops = navigationProgress?.stops;
  const stops = useMemo(() => progressStops?.filter((stop) => stop.visible) ?? trip.stops, [progressStops, trip.stops]);
  const bounds = trip.bounds;
  const coordinates = useMemo(() => bounds.map((point) => ({ latitude: point.lat, longitude: point.lng })), [bounds]);
  const coordinatesKey = useMemo(() => coordinates.map((point) => `${point.latitude},${point.longitude}`).join(';'), [coordinates]);
  const hasNavigationProgress = navigationProgress != null;
  const [selected, setSelected] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [internalFollow, setInternalFollow] = useState(() => navigationProgress != null);
  const following = followUser ?? internalFollow;
  const setFollowing = useCallback((next: boolean) => {
    if (followUser === undefined) setInternalFollow(next);
    onFollowModeChange?.(next);
  }, [followUser, onFollowModeChange]);
  // Stops passed in between are drawn only once they're zoomed apart (stopDeclutter.ts).
  const [zoom, setZoom] = useState(0);
  const [mapWidth, setMapWidth] = useState(0);
  const revealZooms = useMemo(() => viaRevealZooms(stops), [stops]);
  const viaShown = (stop: TripMapStop) => zoom >= (revealZooms.get(stop.leg ?? -1) ?? 0);
  // Which legs' stops in between are drawn, so newly shown markers can be tracked once.
  const shownLegsKey = [...revealZooms].filter(([, reveal]) => zoom >= reveal).map(([leg]) => leg).join(',');
  // Newly shown custom-view markers must render once with tracking on (Android can draw them blank).
  const [tracksVia, setTracksVia] = useState(true);
  const [trackedLegsKey, setTrackedLegsKey] = useState(shownLegsKey);
  if (shownLegsKey !== trackedLegsKey) {
    setTrackedLegsKey(shownLegsKey);
    setTracksVia(true);
  }
  useEffect(() => {
    if (!tracksVia) return undefined;
    const timer = setTimeout(() => setTracksVia(false), 500);
    return () => clearTimeout(timer);
  }, [tracksVia]);
  // Before the map's own layout arrives, the window's width stands in.
  const { width: windowWidth } = useWindowDimensions();
  const onRegionChangeComplete = (region: Region, details?: { isGesture?: boolean }) => {
    setZoom(zoomForRegion(region.longitudeDelta, mapWidth || windowWidth));
    if (interactive && details?.isGesture) {
      setFollowing(false);
      onUserPan?.();
    }
  };

  const frame = useCallback(() => {
    if (coordinates.length > 0) mapRef.current?.fitToCoordinates(coordinates, { edgePadding: padding, animated: false });
    // `coordinates` and `padding` intentionally key this callback by their scalar contents below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinatesKey, padding.top, padding.right, padding.bottom, padding.left]);

  const cameraLocation = followLocation === undefined ? userLocation : followLocation;
  const userLatitude = cameraLocation?.lat;
  const userLongitude = cameraLocation?.lng;
  const followLatitude = navigationProgress?.followTarget?.lat;
  const followLongitude = navigationProgress?.followTarget?.lng;
  const followCamera = useCallback((animated: boolean) => {
    if (userLatitude === undefined || userLongitude === undefined) return;
    const rider = { latitude: userLatitude, longitude: userLongitude };
    if (followLatitude !== undefined && followLongitude !== undefined
      && (followLatitude !== userLatitude || followLongitude !== userLongitude)) {
      mapRef.current?.fitToCoordinates(
        [rider, { latitude: followLatitude, longitude: followLongitude }],
        {
          edgePadding: {
            top: Math.max(padding.top, 120),
            right: Math.max(padding.right, 56),
            bottom: Math.max(padding.bottom, 180),
            left: Math.max(padding.left, 56),
          },
          animated,
        },
      );
      return;
    }
    mapRef.current?.animateCamera({ center: rider, zoom: FOCUS_ZOOM }, { duration: animated ? FOCUS_DURATION_MS : 0 });
  }, [followLatitude, followLongitude, padding.bottom, padding.left, padding.right, padding.top, userLatitude, userLongitude]);

  // Frames the whole trip (or both endpoints while it loads) whenever it changes.
  const frameKey = `${itinerary?.id ?? ''}:${coordinatesKey}`;
  useEffect(() => {
    if (!mapReady) return;
    // Follow mode cannot drive a camera until a trustworthy rider fix exists. Frame the planned
    // route in that interim instead of leaving native on the map provider's default camera.
    if (hasNavigationProgress && userLatitude !== undefined && userLongitude !== undefined) return;
    frame();
  }, [frame, frameKey, hasNavigationProgress, mapReady, userLatitude, userLongitude]);

  // In active navigation, accepted location changes keep the rider and immediate next route
  // target in view. Panning/zooming turns this off until the locate action resumes it.
  useEffect(() => {
    if (!mapReady || !hasNavigationProgress || !following || userLatitude === undefined || userLongitude === undefined) return;
    followCamera(true);
  }, [followCamera, following, hasNavigationProgress, mapReady, userLatitude, userLongitude]);

  // A stop picked from the trip's stop list: centered and labeled.
  const [handledFocusKey, setHandledFocusKey] = useState(focusStop?.key);
  if (focusStop && focusStop.key !== handledFocusKey) {
    setHandledFocusKey(focusStop.key);
    setSelected(stopIndexAt(stops, focusStop.point));
  }
  useEffect(() => {
    if (!focusStop) return;
    mapRef.current?.animateCamera({ center: { latitude: focusStop.point.lat, longitude: focusStop.point.lng }, zoom: FOCUS_ZOOM }, { duration: FOCUS_DURATION_MS });
  }, [focusStop]);

  // The location button: centered on the rider, with the re-frame button offered to come back.
  const [handledCenterRequest, setHandledCenterRequest] = useState(centerOnUserRequest);
  if (centerOnUserRequest !== handledCenterRequest) {
    setHandledCenterRequest(centerOnUserRequest);
    if (navigationProgress && followUser === undefined) setInternalFollow(true);
  }
  const centerRequestForEffect = useRef(centerOnUserRequest);
  useEffect(() => {
    if (centerOnUserRequest === centerRequestForEffect.current) return;
    centerRequestForEffect.current = centerOnUserRequest;
    if (navigationProgress) onFollowModeChange?.(true);
    if (!userLocation) return;
    if (navigationProgress && userLatitude !== undefined && userLongitude !== undefined) followCamera(true);
    else mapRef.current?.animateCamera({ center: { latitude: userLocation.lat, longitude: userLocation.lng }, zoom: FOCUS_ZOOM }, { duration: FOCUS_DURATION_MS });
  }, [centerOnUserRequest, followCamera, navigationProgress, onFollowModeChange, userLatitude, userLocation, userLongitude]);

  const selectedStop = selected !== null ? stops[selected] : undefined;

  return (
    <View onLayout={(event) => setMapWidth(event.nativeEvent.layout.width)} style={StyleSheet.absoluteFill}>
      <MapView
        customMapStyle={mapStyle}
        onMapReady={() => {
          setMapReady(true);
        }}
        onPanDrag={interactive ? () => {
          setFollowing(false);
          onUserPan?.();
        } : undefined}
        onRegionChangeComplete={onRegionChangeComplete}
        // Tapping the map (not a marker) dismisses a stop's label.
        onPress={interactive ? (event: MapPressEvent) => {
          if (event.nativeEvent.action !== 'marker-press') setSelected(null);
        } : undefined}
        pitchEnabled={false}
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        rotateEnabled={false}
        scrollEnabled={interactive}
        showsCompass={false}
        showsMyLocationButton={false}
        // The explicit marker below is the source of truth for GPS and admin-mock fixes.
        showsUserLocation={!navigationProgress && !userLocation}
        style={StyleSheet.absoluteFill}
        testID={testID}
        toolbarEnabled={false}
        zoomEnabled={interactive}
      >
        {legs.map((leg, index) => {
          const progressState = 'state' in leg ? leg.state as ProgressState : undefined;
          const completed = progressState === 'completed';
          const current = progressState === 'current';
          return (
            <Polyline
              key={`leg-${index}`}
              coordinates={leg.path.map((point) => ({ latitude: point.lat, longitude: point.lng }))}
              lineDashPattern={leg.walk ? WALK_DASH : undefined}
              strokeColor={completed ? colors.mutedInk : leg.walk ? colors.mutedInk : leg.color ?? colors.primary}
              strokeWidth={completed ? (leg.walk ? 3 : 4) : current ? (leg.walk ? 6 : 8) : leg.walk ? WALK_WIDTH : TRANSIT_WIDTH}
              testID={progressState ? `${testID}-progress-${progressState}-${index}` : leg.walk ? `trip-map-walk-${index}` : `trip-map-transit-${index}`}
              zIndex={current ? 3 : leg.walk ? 1 : 2}
            />
          );
        })}
        {stops.map((stop, index) => (stop.kind === 'via' && !viaShown(stop) && index !== selected ? null : (
          <Marker
            key={`stop-${index}`}
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={{ latitude: stop.point.lat, longitude: stop.point.lng }}
            onPress={interactive ? () => setSelected(index) : undefined}
            tappable={interactive}
            testID={`trip-map-${stop.kind}-${index}`}
            tracksViewChanges={stop.kind === 'via' && tracksVia}
            zIndex={stop.kind === 'via' ? 2 : 3}
          >
            <View
              style={[
                stop.kind === 'via' ? styles.viaDot : styles.dot,
                'state' in stop && stop.state === 'completed' && styles.completedStop,
                stop.kind === 'start' && { backgroundColor: colors.success },
                stop.kind === 'end' && { backgroundColor: colors.primary },
                (stop.kind === 'stop' || stop.kind === 'via') && { backgroundColor: colors.white, borderColor: stop.color ?? colors.primary },
              ]}
            />
          </Marker>
        )))}
        {userLocation ? (
          <Marker
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }}
            testID={`${testID}-user-location`}
            // One always-tracked marker guarantees theme/stale-state changes redraw on Android.
            tracksViewChanges={true}
            zIndex={5}
          >
            <View pointerEvents="none" style={userLocationStale ? styles.staleLocation : undefined} testID={`${testID}-user-location-visual`}>
              <CurrentLocationMarker />
            </View>
          </Marker>
        ) : null}
        {selectedStop?.label ? (
          // A themed label above the stop (the native callout can't follow the app's theme).
          <Marker anchor={{ x: 0.5, y: 1.25 }} coordinate={{ latitude: selectedStop.point.lat, longitude: selectedStop.point.lng }} testID="trip-map-stop-label" tracksViewChanges={true} zIndex={4}>
            <View style={styles.label}><Text numberOfLines={1} style={styles.labelText}>{selectedStop.label}</Text></View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  completedStop: { opacity: 0.48 },
  dot: { width: 14, height: 14, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 7 },
  viaDot: { width: 9, height: 9, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 5 },
  label: { maxWidth: 240, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  labelText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 13 },
  staleLocation: { opacity: 0.45 },
});
