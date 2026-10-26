import { FLOAT_PANE, GoogleMap, Marker, OverlayViewF, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import { googleMapStyle } from '../data/mapStyle';
import { themedRouteColor } from '../data/routeColors';
import { stopIndexAt, tripMapPoints, viaRevealZooms, type TripMapProps, type TripMapStop } from '../data/tripMap';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { HeadingBeamMarker } from './HeadingBeamMarker';

const containerStyle = { width: '100%', height: '100%' };
const baseMapOptions = { disableDefaultUI: true, keyboardShortcuts: false, clickableIcons: false };
const FALLBACK_CENTER = { lat: 40.75, lng: -73.95 };
const FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
const TRANSIT_WIDTH = 6;
// Walks are plain round gray dots, which read from far out over any street.
const WALK_DOT_SCALE = 3.5;
const FOCUS_ZOOM = 15;

type ProgressState = 'completed' | 'current' | 'upcoming';

/** Centers the stop label above its marker. */
const labelOffset = (width: number, height: number) => ({ x: -width / 2, y: -height - 14 });
const locationOffset = () => ({ x: -19, y: -19 });

/**
 * A planned trip on a real map: each leg in its line's color, walking dotted, a marker at every
 * stop. Interactive maps pan and zoom, label a clicked stop, and offer to re-frame the whole trip.
 */
export function TripMap({ centerOnUserRequest = 0, destination, focusStop, followLocation, followUser, interactive = false, itinerary, navigationProgress, onFollowModeChange, onUserPan, origin, padding = FIT_PADDING, testID = 'trip-map', userLocation, userLocationStale = false }: TripMapProps) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  // Interactive maps take every gesture where content doesn't cover them, like the live route map.
  const mapOptions = useMemo(
    () => ({ ...baseMapOptions, gestureHandling: interactive ? 'greedy' : 'none', styles: googleMapStyle(isDark) }),
    [interactive, isDark],
  );
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const trip = useMemo(() => tripMapPoints(itinerary, origin, destination), [destination, itinerary, origin]);
  const legs = navigationProgress?.segments ?? trip.legs;
  const progressStops = navigationProgress?.stops;
  const stops = useMemo(() => progressStops?.filter((stop) => stop.visible) ?? trip.stops, [progressStops, trip.stops]);
  const bounds = trip.bounds;
  const boundsKey = useMemo(() => bounds.map((point) => `${point.lat},${point.lng}`).join(';'), [bounds]);
  const hasNavigationProgress = navigationProgress != null;
  const [selected, setSelected] = useState<number | null>(null);
  const [internalFollow, setInternalFollow] = useState(() => navigationProgress != null);
  const following = followUser ?? internalFollow;
  const setFollowing = useCallback((next: boolean) => {
    if (followUser === undefined) setInternalFollow(next);
    onFollowModeChange?.(next);
  }, [followUser, onFollowModeChange]);
  // Zoom events do not identify whether they came from a gesture. Camera methods hold this flag
  // until the map's idle event so their zoom changes do not accidentally pause follow mode.
  const programmaticCamera = useRef(true);
  // Stops passed in between are drawn only once they're zoomed apart (stopDeclutter.ts).
  const [zoom, setZoom] = useState(0);
  // The loaded map, readable from its first zoom change (before `map` state has updated).
  const zoomSource = useRef<google.maps.Map | null>(null);
  const revealZooms = useMemo(() => viaRevealZooms(stops), [stops]);
  const viaShown = (stop: TripMapStop) => zoom >= (revealZooms.get(stop.leg ?? -1) ?? 0);

  const frame = useCallback(() => {
    if (!map || bounds.length === 0) return;
    programmaticCamera.current = true;
    const box = new google.maps.LatLngBounds();
    for (const point of bounds) box.extend(point);
    map.fitBounds(box, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scalar keys cover geometry and padding
  }, [boundsKey, map, padding.bottom, padding.left, padding.right, padding.top]);

  // Frames the whole trip (or both endpoints while it loads) whenever it changes.
  useEffect(frame, [frame]);
  const onLoad = useCallback((loaded: google.maps.Map) => {
    setMap(loaded);
    zoomSource.current = loaded;
    setZoom(loaded.getZoom() ?? 0);
  }, []);

  const cameraLocation = followLocation === undefined ? userLocation : followLocation;
  const userLatitude = cameraLocation?.lat;
  const userLongitude = cameraLocation?.lng;
  const followLatitude = navigationProgress?.followTarget?.lat;
  const followLongitude = navigationProgress?.followTarget?.lng;
  const followCamera = useCallback(() => {
    if (!map || userLatitude === undefined || userLongitude === undefined) return;
    programmaticCamera.current = true;
    const rider = { lat: userLatitude, lng: userLongitude };
    if (followLatitude !== undefined && followLongitude !== undefined
      && (followLatitude !== userLatitude || followLongitude !== userLongitude)) {
      const box = new google.maps.LatLngBounds();
      box.extend(rider);
      box.extend({ lat: followLatitude, lng: followLongitude });
      map.fitBounds(box, {
        top: Math.max(padding.top, 120),
        right: Math.max(padding.right, 56),
        bottom: Math.max(padding.bottom, 180),
        left: Math.max(padding.left, 56),
      });
      return;
    }
    map.panTo(rider);
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
  }, [followLatitude, followLongitude, map, padding.bottom, padding.left, padding.right, padding.top, userLatitude, userLongitude]);

  useEffect(() => {
    if (!hasNavigationProgress || !following || userLatitude === undefined || userLongitude === undefined) return;
    followCamera();
  }, [followCamera, following, hasNavigationProgress, userLatitude, userLongitude]);

  // A stop picked from the trip's stop list: centered and labeled.
  const [handledFocusKey, setHandledFocusKey] = useState(focusStop?.key);
  if (focusStop && focusStop.key !== handledFocusKey) {
    setHandledFocusKey(focusStop.key);
    setSelected(stopIndexAt(stops, focusStop.point));
  }
  useEffect(() => {
    if (!map || !focusStop) return;
    programmaticCamera.current = true;
    map.panTo(focusStop.point);
    map.setZoom(FOCUS_ZOOM);
  }, [map, focusStop]);

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
    if (!map || !userLocation) return;
    if (navigationProgress && userLatitude !== undefined && userLongitude !== undefined) followCamera();
    else {
      programmaticCamera.current = true;
      map.panTo(userLocation);
      if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
    }
  }, [centerOnUserRequest, followCamera, map, navigationProgress, onFollowModeChange, userLatitude, userLocation, userLongitude]);

  if (!isLoaded) return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapLand }]} testID={testID} />;

  const selectedStop = selected !== null ? stops[selected] : undefined;
  // Walking: a row of dots instead of a solid line.
  const walkIcons = [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: WALK_DOT_SCALE, fillColor: colors.mutedInk, fillOpacity: 1, strokeWeight: 0 }, offset: '0', repeat: '13px' }];
  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <GoogleMap
        center={FALLBACK_CENTER}
        mapContainerStyle={containerStyle}
        onClick={interactive ? () => setSelected(null) : undefined}
        onDragStart={interactive ? () => {
          setFollowing(false);
          onUserPan?.();
        } : undefined}
        onIdle={() => {
          programmaticCamera.current = false;
        }}
        onLoad={onLoad}
        onZoomChanged={() => {
          setZoom(zoomSource.current?.getZoom() ?? 0);
          if (interactive && !programmaticCamera.current) {
            setFollowing(false);
            onUserPan?.();
          }
        }}
        options={mapOptions}
        zoom={11}
      >
        {legs.map((leg, index) => {
          const progressState = 'state' in leg ? leg.state as ProgressState : undefined;
          const completed = progressState === 'completed';
          const current = progressState === 'current';
          const progressWalkIcons = leg.walk ? [{
            ...walkIcons[0],
            icon: {
              ...walkIcons[0]!.icon,
              fillColor: colors.mutedInk,
              fillOpacity: completed ? 0.45 : 1,
              scale: current ? 4.25 : completed ? 2.5 : WALK_DOT_SCALE,
            },
          }] : undefined;
          return (
            <Polyline
              key={`leg-${index}`}
              options={leg.walk
                ? { strokeOpacity: 0, icons: progressWalkIcons, zIndex: current ? 3 : 1, clickable: false }
                : {
                  strokeColor: completed ? colors.mutedInk : themedRouteColor(leg.color ?? colors.primary, isDark),
                  strokeOpacity: completed ? 0.45 : 1,
                  strokeWeight: completed ? 4 : current ? 8 : TRANSIT_WIDTH,
                  zIndex: current ? 3 : 2,
                  clickable: false,
                }}
              path={leg.path}
            />
          );
        })}
        {stops.map((stop, index) => (stop.kind === 'via' && !viaShown(stop) && index !== selected ? null : (
          <Marker
            key={`stop-${index}`}
            clickable={interactive}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: stop.kind === 'via' ? 3.5 : 6,
              fillColor: stop.kind === 'start' ? colors.success : stop.kind === 'end' ? colors.primary : '#FFFFFF',
              fillOpacity: 'state' in stop && stop.state === 'completed' ? 0.48 : 1,
              strokeColor: stop.kind === 'stop' || stop.kind === 'via' ? themedRouteColor(stop.color ?? colors.primary, isDark) : '#FFFFFF',
              strokeOpacity: 'state' in stop && stop.state === 'completed' ? 0.48 : 1,
              strokeWeight: stop.kind === 'via' ? 2 : 3,
            }}
            onClick={interactive ? () => setSelected(index) : undefined}
            position={stop.point}
            title={stop.label}
            zIndex={stop.kind === 'via' ? 2 : 3}
          />
        )))}
        {userLocation ? <HeadingBeamMarker coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }} /> : null}
        {userLocation ? (
          <OverlayViewF getPixelPositionOffset={locationOffset} mapPaneName={FLOAT_PANE} position={userLocation}>
            <View pointerEvents="none" style={userLocationStale ? styles.staleLocation : undefined} testID={`${testID}-user-location`}>
              <CurrentLocationMarker />
            </View>
          </OverlayViewF>
        ) : null}
        {selectedStop?.label ? (
          <OverlayViewF getPixelPositionOffset={labelOffset} mapPaneName={FLOAT_PANE} position={selectedStop.point}>
            <View style={styles.label} testID="trip-map-stop-label"><Text numberOfLines={1} style={styles.labelText}>{selectedStop.label}</Text></View>
          </OverlayViewF>
        ) : null}
      </GoogleMap>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  label: { maxWidth: 240, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  labelText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 13, whiteSpace: 'nowrap' } as object,
  staleLocation: { opacity: 0.45 },
});
