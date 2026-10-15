import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';

import { googleMapStyle } from '../data/mapStyle';
import { zoomForRegion } from '../data/stopDeclutter';
import { stopIndexAt, tripMapPoints, viaRevealZooms, type TripMapProps, type TripMapStop } from '../data/tripMap';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

const FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
const TRANSIT_WIDTH = 6;
const WALK_WIDTH = 4;
const WALK_DASH = [2, 8];
const FOCUS_ZOOM = 15;
const FOCUS_DURATION_MS = 350;

/**
 * A planned trip on a real map: each leg in its line's color, walking dotted, a marker at every
 * stop. Interactive maps pan and zoom, label a tapped stop, and offer to re-frame the whole trip.
 */
export function TripMap({ centerOnUserRequest = 0, destination, focusStop, interactive = false, itinerary, onUserPan, origin, padding = FIT_PADDING, testID = 'trip-map', userLocation }: TripMapProps) {
  const mapRef = useRef<MapView>(null);
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  const mapStyle = useMemo(() => googleMapStyle(isDark), [isDark]);
  const { legs, stops, bounds } = useMemo(() => tripMapPoints(itinerary, origin, destination), [destination, itinerary, origin]);
  const coordinates = bounds.map((point) => ({ latitude: point.lat, longitude: point.lng }));
  const [selected, setSelected] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
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
  const onRegionChangeComplete = (region: Region) => setZoom(zoomForRegion(region.longitudeDelta, mapWidth || windowWidth));

  const frame = () => {
    if (coordinates.length > 0) mapRef.current?.fitToCoordinates(coordinates, { edgePadding: padding, animated: false });
  };

  // Frames the whole trip (or both endpoints while it loads) whenever it changes.
  const frameKey = `${itinerary?.id ?? ''}:${coordinates.length}`;
  useEffect(() => {
    frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the trip, not on array identity
  }, [frameKey]);

  // A stop picked from the trip's stop list: centered and labeled.
  const [handledFocusKey, setHandledFocusKey] = useState(focusStop?.key);
  if (focusStop && focusStop.key !== handledFocusKey) {
    setHandledFocusKey(focusStop.key);
    setSelected(stopIndexAt(stops, focusStop.point));
    setMoved(true);
  }
  useEffect(() => {
    if (!focusStop) return;
    mapRef.current?.animateCamera({ center: { latitude: focusStop.point.lat, longitude: focusStop.point.lng }, zoom: FOCUS_ZOOM }, { duration: FOCUS_DURATION_MS });
  }, [focusStop]);

  // The location button: centered on the rider, with the re-frame button offered to come back.
  const [handledCenterRequest, setHandledCenterRequest] = useState(centerOnUserRequest);
  if (centerOnUserRequest !== handledCenterRequest) {
    setHandledCenterRequest(centerOnUserRequest);
    if (userLocation) setMoved(true);
  }
  useEffect(() => {
    if (centerOnUserRequest === 0 || !userLocation) return;
    mapRef.current?.animateCamera({ center: { latitude: userLocation.lat, longitude: userLocation.lng }, zoom: FOCUS_ZOOM }, { duration: FOCUS_DURATION_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request; the location is read at request time
  }, [centerOnUserRequest]);

  const selectedStop = selected !== null ? stops[selected] : undefined;

  return (
    <View onLayout={(event) => setMapWidth(event.nativeEvent.layout.width)} style={StyleSheet.absoluteFill}>
      <MapView
        customMapStyle={mapStyle}
        onMapReady={frame}
        onPanDrag={interactive ? () => {
          setMoved(true);
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
        showsUserLocation={true}
        style={StyleSheet.absoluteFill}
        testID={testID}
        toolbarEnabled={false}
        zoomEnabled={interactive}
      >
        {legs.map((leg, index) => (
          <Polyline
            key={`leg-${index}`}
            coordinates={leg.path.map((point) => ({ latitude: point.lat, longitude: point.lng }))}
            lineDashPattern={leg.walk ? WALK_DASH : undefined}
            strokeColor={leg.walk ? colors.mutedInk : leg.color ?? colors.primary}
            strokeWidth={leg.walk ? WALK_WIDTH : TRANSIT_WIDTH}
            testID={leg.walk ? `trip-map-walk-${index}` : `trip-map-transit-${index}`}
            zIndex={leg.walk ? 1 : 2}
          />
        ))}
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
                stop.kind === 'start' && { backgroundColor: colors.success },
                stop.kind === 'end' && { backgroundColor: colors.primary },
                (stop.kind === 'stop' || stop.kind === 'via') && { backgroundColor: colors.white, borderColor: stop.color ?? colors.primary },
              ]}
            />
          </Marker>
        )))}
        {selectedStop?.label ? (
          // A themed label above the stop (the native callout can't follow the app's theme).
          <Marker anchor={{ x: 0.5, y: 1.25 }} coordinate={{ latitude: selectedStop.point.lat, longitude: selectedStop.point.lng }} testID="trip-map-stop-label" tracksViewChanges={true} zIndex={4}>
            <View style={styles.label}><Text numberOfLines={1} style={styles.labelText}>{selectedStop.label}</Text></View>
          </Marker>
        ) : null}
      </MapView>
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
  dot: { width: 14, height: 14, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 7 },
  viaDot: { width: 9, height: 9, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 5 },
  label: { maxWidth: 240, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  labelText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 13 },
  reframe: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 },
});
