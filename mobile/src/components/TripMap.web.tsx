import { FLOAT_PANE, GoogleMap, Marker, OverlayViewF, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import { googleMapStyle } from '../data/mapStyle';
import { stopIndexAt, tripMapPoints, viaRevealZooms, type TripMapProps, type TripMapStop } from '../data/tripMap';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

const containerStyle = { width: '100%', height: '100%' };
const baseMapOptions = { disableDefaultUI: true, keyboardShortcuts: false, clickableIcons: false };
const FALLBACK_CENTER = { lat: 40.75, lng: -73.95 };
const FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
const TRANSIT_WIDTH = 6;
const WALK_DOT_SCALE = 2.5;
const FOCUS_ZOOM = 15;

/** Centers the stop label above its marker. */
const labelOffset = (width: number, height: number) => ({ x: -width / 2, y: -height - 14 });

/**
 * A planned trip on a real map: each leg in its line's color, walking dotted, a marker at every
 * stop. Interactive maps pan and zoom, label a clicked stop, and offer to re-frame the whole trip.
 */
export function TripMap({ centerOnUserRequest = 0, destination, focusStop, interactive = false, itinerary, onUserPan, origin, padding = FIT_PADDING, testID = 'trip-map', userLocation }: TripMapProps) {
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
  const { legs, stops, bounds } = useMemo(() => tripMapPoints(itinerary, origin, destination), [destination, itinerary, origin]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
  // Stops passed in between are drawn only once they're zoomed apart (stopDeclutter.ts).
  const [zoom, setZoom] = useState(0);
  // The loaded map, readable from its first zoom change (before `map` state has updated).
  const zoomSource = useRef<google.maps.Map | null>(null);
  const revealZooms = useMemo(() => viaRevealZooms(stops), [stops]);
  const viaShown = (stop: TripMapStop) => zoom >= (revealZooms.get(stop.leg ?? -1) ?? 0);

  const frame = useCallback(() => {
    if (!map || bounds.length === 0) return;
    const box = new google.maps.LatLngBounds();
    for (const point of bounds) box.extend(point);
    map.fitBounds(box, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `bounds` and `padding` change identity every render
  }, [map, bounds.length, itinerary?.id]);

  // Frames the whole trip (or both endpoints while it loads) whenever it changes.
  useEffect(frame, [frame]);
  const onLoad = useCallback((loaded: google.maps.Map) => {
    setMap(loaded);
    zoomSource.current = loaded;
    setZoom(loaded.getZoom() ?? 0);
  }, []);

  // A stop picked from the trip's stop list: centered and labeled.
  const [handledFocusKey, setHandledFocusKey] = useState(focusStop?.key);
  if (focusStop && focusStop.key !== handledFocusKey) {
    setHandledFocusKey(focusStop.key);
    setSelected(stopIndexAt(stops, focusStop.point));
    setMoved(true);
  }
  useEffect(() => {
    if (!map || !focusStop) return;
    map.panTo(focusStop.point);
    map.setZoom(FOCUS_ZOOM);
  }, [map, focusStop]);

  // The location button: centered on the rider, with the re-frame button offered to come back.
  const [handledCenterRequest, setHandledCenterRequest] = useState(centerOnUserRequest);
  if (centerOnUserRequest !== handledCenterRequest) {
    setHandledCenterRequest(centerOnUserRequest);
    if (userLocation) setMoved(true);
  }
  useEffect(() => {
    if (!map || centerOnUserRequest === 0 || !userLocation) return;
    map.panTo(userLocation);
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request; the location is read at request time
  }, [map, centerOnUserRequest]);

  if (!isLoaded) return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapLand }]} testID={testID} />;

  const selectedStop = selected !== null ? stops[selected] : undefined;
  // Walking: a row of dots instead of a solid line.
  const walkIcons = [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: WALK_DOT_SCALE, fillColor: colors.mutedInk, fillOpacity: 1, strokeOpacity: 0 }, offset: '0', repeat: '10px' }];
  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <GoogleMap
        center={FALLBACK_CENTER}
        mapContainerStyle={containerStyle}
        onClick={interactive ? () => setSelected(null) : undefined}
        onDragStart={interactive ? () => {
          setMoved(true);
          onUserPan?.();
        } : undefined}
        onLoad={onLoad}
        onZoomChanged={() => setZoom(zoomSource.current?.getZoom() ?? 0)}
        options={mapOptions}
        zoom={11}
      >
        {legs.map((leg, index) => (
          <Polyline
            key={`leg-${index}`}
            options={leg.walk
              ? { strokeOpacity: 0, icons: walkIcons, zIndex: 1, clickable: false }
              : { strokeColor: leg.color ?? colors.primary, strokeWeight: TRANSIT_WIDTH, zIndex: 2, clickable: false }}
            path={leg.path}
          />
        ))}
        {stops.map((stop, index) => (stop.kind === 'via' && !viaShown(stop) && index !== selected ? null : (
          <Marker
            key={`stop-${index}`}
            clickable={interactive}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: stop.kind === 'via' ? 3.5 : 6,
              fillColor: stop.kind === 'start' ? colors.success : stop.kind === 'end' ? colors.primary : '#FFFFFF',
              fillOpacity: 1,
              strokeColor: stop.kind === 'stop' || stop.kind === 'via' ? stop.color ?? colors.primary : '#FFFFFF',
              strokeWeight: stop.kind === 'via' ? 2 : 3,
            }}
            onClick={interactive ? () => setSelected(index) : undefined}
            position={stop.point}
            title={stop.label}
            zIndex={stop.kind === 'via' ? 2 : 3}
          />
        )))}
        {userLocation ? (
          // Same blue "you are here" dot as the route map.
          <Marker
            clickable={false}
            icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }}
            position={userLocation}
            title="Your location"
            zIndex={4}
          />
        ) : null}
        {selectedStop?.label ? (
          <OverlayViewF getPixelPositionOffset={labelOffset} mapPaneName={FLOAT_PANE} position={selectedStop.point}>
            <View style={styles.label} testID="trip-map-stop-label"><Text numberOfLines={1} style={styles.labelText}>{selectedStop.label}</Text></View>
          </OverlayViewF>
        ) : null}
      </GoogleMap>
      {interactive && moved ? (
        <PressableScale
          accessibilityLabel="Show the whole trip"
          accessibilityRole="button"
          onPress={() => {
            setMoved(false);
            setSelected(null);
            frame();
          }}
          style={[styles.reframe, { top: padding.top, right: 14 }]}
          testID={`${testID}-reframe`}
        >
          <Icon color={colors.primary} name="fit" size={22} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  label: { maxWidth: 240, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  labelText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 13, whiteSpace: 'nowrap' } as object,
  reframe: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8 },
});
