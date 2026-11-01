import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SearchPlace } from '../data/placesSearch';
import { addressAt, type PinAddress } from '../data/reverseGeocode';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useThumbSide } from '../hooks/useThumbSide';
import { ThemedStatusBar, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { CurrentLocationButton } from './CurrentLocationButton';
import { DESTINATION_PIN_HEIGHT, DestinationPinMarker } from './DestinationPinMarker';
import { GoogleMapView } from './GoogleMapView';
import { MapControlButton } from './MapControlButton';
import { PressableScale } from './PressableScale';
import { radii } from '../theme/shape';

/** The map coming to rest, not every frame of a drag, looks up the address. */
const LOOKUP_DELAY_MS = 400;
/** Set location waits this long at most for an address still being looked up. */
const LOOKUP_WAIT_MS = 3000;

const pointKey = (point: Coordinates) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

/** A search place for a point picked on the map, named by its address when one is known. */
export function droppedPinPlace(point: Coordinates, address?: PinAddress | null): SearchPlace {
  const latitude = Number(point.latitude.toFixed(6));
  const longitude = Number(point.longitude.toFixed(6));
  return {
    id: address?.placeId ?? `pin:${latitude},${longitude}`,
    title: address?.title ?? 'Dropped pin',
    subtitle: address ? address.subtitle : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    location: { latitude, longitude },
  };
}

type MapPickerViewProps = {
  /** Where the map opens: the rider's location. */
  location: Coordinates;
  onCancel: () => void;
  onPick: (place: SearchPlace) => void;
};

/**
 * "Choose on map": the rider moves the map under a fixed center pin, then sets that point as the
 * trip's start or destination.
 */
export function MapPickerView({ location, onCancel, onPick }: MapPickerViewProps) {
  const styles = useThemedStyles(createStyles);
  const thumb = useThumbSide();
  const [center, setCenter] = useState<Coordinates>(location);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [bottomInset, setBottomInset] = useState(180);
  // The address under the pin, once the map rests; keyed by point so a stale answer never shows.
  const [address, setAddress] = useState<{ key: string; value: PinAddress | null } | null>(null);
  const lookups = useRef(new Map<string, Promise<PinAddress | null>>());
  const lookUp = (point: Coordinates) => {
    const key = pointKey(point);
    let lookup = lookups.current.get(key);
    if (!lookup) {
      lookup = addressAt(point);
      lookups.current.set(key, lookup);
    }
    return lookup;
  };
  const centerKey = pointKey(center);
  const shown = address?.key === centerKey ? address : null;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void lookUp(center).then((value) => {
        if (!cancelled) setAddress({ key: centerKey, value });
      });
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Keyed on the rounded point, not the object (new on every camera event).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);
  // Uses the address under the pin, waiting briefly if it's still being looked up.
  const pick = async () => {
    const point = center;
    const found = shown ? shown.value : await Promise.race([lookUp(point), new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_WAIT_MS))]);
    onPick(droppedPinPlace(point, found));
  };
  return (
    // Like every other page, a phone-width column centered on wide (web) screens.
    <View style={styles.viewport}>
      <View style={styles.screen} testID="map-picker">
        <ThemedStatusBar />
        <GoogleMapView
          initialCamera={{ latitude: location.latitude, longitude: location.longitude, zoom: 16 }}
          location={location}
          padding={{ bottom: bottomInset }}
          onCameraChange={(camera) => setCenter({ latitude: camera.latitude, longitude: camera.longitude })}
          recenterRequest={recenterRequest}
          testID="map-picker-map"
        />
        {/* The pin's point sits on the map's center; it ignores touches so the map pans under it. */}
        <View pointerEvents="none" style={[styles.pinWrap, { bottom: bottomInset }]}>
          <DestinationPinMarker testID="map-picker-pin" />
        </View>
        <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topBar}>
          <MapControlButton accessibilityLabel="Back" icon="back" onPress={onCancel} testID="map-picker-back" />
        </SafeAreaView>
        <View style={[styles.locateButton, thumb.anchor(16), { bottom: bottomInset + 16 + thumb.mapBottomClearance }]}>
          <CurrentLocationButton onPress={() => setRecenterRequest((count) => count + 1)} selected={false} testID="map-picker-locate" />
        </View>
        <SafeAreaView edges={['bottom']} pointerEvents="box-none" onLayout={(event) => setBottomInset(event.nativeEvent.layout.height)} style={styles.bottomBar}>
          <View style={styles.card}>
            <View accessibilityLiveRegion="polite" style={styles.addressBlock} testID="map-picker-address">
              <Text numberOfLines={1} style={styles.addressTitle}>{shown ? shown.value?.title ?? 'Dropped pin' : 'Finding the address…'}</Text>
              <Text numberOfLines={1} style={styles.hint}>{shown?.value ? shown.value.subtitle : 'Move the map to place the pin'}</Text>
            </View>
            <PressableScale accessibilityRole="button" onPress={() => void pick()} style={styles.setButton} testID="map-picker-set">
              <Text style={styles.setText}>Set location</Text>
            </PressableScale>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.surface },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.surface },
  pinWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifts the pin so its tip, not its middle, marks the center.
    paddingBottom: DESTINATION_PIN_HEIGHT,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  locateButton: { position: 'absolute' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: {
    gap: 12,
    padding: 16,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  addressBlock: { alignItems: 'center', gap: 2 },
  addressTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 16, textAlign: 'center' },
  hint: { color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
  setButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  setText: { color: colors.onPrimary, ...typography.bodyStrong, fontSize: 16 },
});
