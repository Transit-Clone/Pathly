import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rideGuideItinerary, rideStopTimes, type RideGuideRequest } from '../data/rideGuide';
import { withAlpha } from '../data/routeDirection';
import { useRouteColor } from '../data/routeColors';
import { legDepartureOptions, retimeItinerary, type DepartureChoices } from '../data/tripDepartures';
import { formatTripClock, type Itinerary, type LatLng, type TransitStep } from '../data/tripPlanning';
import { useUserPreferences } from '../data/userPreferences';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useClock } from '../hooks/useClock';
import { useTripVehicles } from '../hooks/useTripVehicles';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { radii } from '../theme/shape';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { toTripDetailModel, withMapLive } from './PlannedTripDetailView';
import { PressableScale } from './PressableScale';
import { SharedTripDetailView, tripDetailMapPadding } from './SharedTripDetailView';
import { SheetPanel } from './SheetPanel';
import { TripMap } from './TripMap';

type RideGuideViewProps = {
  request: RideGuideRequest;
  onBack: () => void;
  /** Starts en-route navigation for the ride as shown: the departure and stop the rider picked. */
  onStart: (itinerary: Itinerary, alightName: string) => void;
  /** The rider's real position, for the map's location button; null when unknown. */
  riderLocation?: Coordinates | null;
};

/**
 * Route View's GO: one line, for a rider who already knows they're taking it. Laid out like Trip
 * Details ("Leave within", leave and arrive times, the ride with its departures and alerts), for
 * that one ride, with every stop after the rider's listed to pick where they get off; each shows
 * when the ride gets there. GO here starts en-route navigation for it.
 */
export function RideGuideView({ onBack, onStart, request, riderLocation }: RideGuideViewProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const tint = useRouteColor();
  const { preferences } = useUserPreferences();
  const lineColor = tint(request.color);
  // The end of the line until the rider picks their stop.
  const [alightIndex, setAlightIndex] = useState(request.stops.length - 1);
  const [choices, setChoices] = useState<DepartureChoices>(new Map());
  const [focusStop, setFocusStop] = useState<{ point: LatLng; key: number } | null>(null);
  const [centerRequest, setCenterRequest] = useState(0);
  const [centered, setCentered] = useState(false);
  const [pickingStop, setPickingStop] = useState(false);
  const now = useClock(30_000);
  const planned = useMemo(() => rideGuideItinerary(request, alightIndex), [alightIndex, request]);
  const itinerary = useMemo(() => (planned ? retimeItinerary(planned, choices, now) : null), [choices, now, planned]);
  const departures = useMemo(() => (planned ? legDepartureOptions(planned, choices, now) : []), [choices, now, planned]);
  const { vehicles, approachLines } = useTripVehicles(itinerary, colors.primary);
  if (!itinerary) return null;

  const ride = itinerary.steps.find((step): step is TransitStep => step.kind === 'transit')!;
  const alight = request.stops[alightIndex] ?? request.stops.at(-1)!;
  const stopTimes = rideStopTimes(request, ride.from.time);
  const userLocation = riderLocation ? { lat: riderLocation.latitude, lng: riderLocation.longitude } : null;
  const model = withMapLive({
    ...toTripDetailModel(itinerary, request.stops[0]!.name, alight.name, false, colors.primary, departures, preferences.travel.fareType),
    // No fare is known for a ride picked this way; the page doesn't guess one.
    fare: '',
    contextLabel: 'RIDE',
  }, itinerary, vehicles, now);

  const alightArrives = stopTimes.find((entry) => entry.index === alightIndex)?.arrives;

  // The page shows just the stop picked; every stop opens in a popup, so a long line doesn't make
  // the page long.
  const stopPicker = (
    <PressableScale
      accessibilityHint="Opens the list of stops to pick where you get off"
      accessibilityLabel={`Getting off at ${alight.name}${alightArrives ? `, arrive about ${formatTripClock(alightArrives)}` : ''}`}
      accessibilityRole="button"
      onPress={() => setPickingStop(true)}
      pressedScale={0.99}
      style={styles.picker}
      testID="ride-guide-stop-picker"
    >
      <View style={[styles.pickerDot, { borderColor: lineColor, backgroundColor: lineColor }]} />
      <View style={styles.pickerCopy}>
        <Text style={styles.pickerLabel}>Getting off at</Text>
        <Text numberOfLines={1} style={styles.pickerStop} testID="ride-guide-stop-picked">{alight.name}</Text>
      </View>
      {alightArrives ? <Text style={styles.stopTimeSelected}>{formatTripClock(alightArrives)}</Text> : null}
      <Icon color={colors.mutedInk} name="expand" size={18} />
    </PressableScale>
  );

  const stopSheet = (
    <Modal animationType="fade" onRequestClose={() => setPickingStop(false)} transparent={true} visible={pickingStop}>
      <Pressable accessibilityLabel="Close stops" onPress={() => setPickingStop(false)} style={styles.sheetBackdrop} testID="ride-guide-stops-backdrop" />
      {pickingStop ? (
        <SheetPanel style={styles.sheet} testID="ride-guide-stops">
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Where are you getting off?</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={() => setPickingStop(false)} testID="ride-guide-stops-close"><Icon name="close" size={26} /></PressableScale>
          </View>
          <Text style={styles.pickerHint}>{`From ${request.stops[0]!.name}, on the ${formatTripClock(ride.from.time)}. Times are estimates.`}</Text>
          <ScrollView contentContainerStyle={styles.pickerList}>
        {stopTimes.map(({ arrives, index, stop }, row) => {
          const selected = index === alightIndex;
          const isLast = row === stopTimes.length - 1;
          return (
            <PressableScale
              key={`${stop.stopId ?? stop.name}-${index}`}
              accessibilityHint="Gets off here"
              accessibilityLabel={`${stop.name}, arrive about ${formatTripClock(arrives)}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setAlightIndex(index);
                setPickingStop(false);
              }}
              pressedScale={0.99}
              style={[styles.stopRow, selected && { backgroundColor: withAlpha(lineColor, 0.12) }]}
              testID={`ride-guide-stop-${index}`}
            >
              <View style={styles.rail}>
                <View style={[styles.railLine, styles.railTop, { backgroundColor: lineColor }]} />
                {!isLast ? <View style={[styles.railLine, styles.railBottom, { backgroundColor: lineColor }]} /> : null}
                <View style={[styles.stopDot, { borderColor: lineColor }, selected && { backgroundColor: lineColor }]} />
              </View>
              <Text numberOfLines={2} style={[styles.stopName, selected && styles.stopNameSelected]}>{stop.name}</Text>
              {selected ? <Icon color={lineColor} name="check" size={18} /> : null}
              <Text style={[styles.stopTime, selected && styles.stopTimeSelected]} testID={`ride-guide-stop-time-${index}`}>{formatTripClock(arrives)}</Text>
            </PressableScale>
          );
        })}
          </ScrollView>
        </SheetPanel>
      ) : null}
    </Modal>
  );

  return (
    <>
    {stopSheet}
    <SharedTripDetailView
      actionLabel={`Start ride to ${alight.name}`}
      backLabel="Back to route"
      beforeSteps={stopPicker}
      interactiveMap={true}
      isFavorite={false}
      locationSelected={centered}
      map={(
        <TripMap
          approachLines={approachLines}
          centerOnUserRequest={centerRequest}
          focusStop={focusStop}
          interactive={true}
          itinerary={itinerary}
          onUserPan={() => setCentered(false)}
          padding={tripDetailMapPadding(insets.top, false)}
          testID="ride-guide-map"
          userLocation={userLocation}
          vehicles={vehicles}
        />
      )}
      model={model}
      onAction={() => onStart(itinerary, alight.name)}
      onBack={onBack}
      onCenterOnLocation={() => {
        setCenterRequest((count) => count + 1);
        setCentered(true);
      }}
      onFocusStop={(stop) => setFocusStop((current) => ({ point: stop.point, key: (current?.key ?? 0) + 1 }))}
      onSelectDeparture={(legIndex, departs) => setChoices((current) => new Map(current).set(legIndex, departs))}
      onToggleFavorite={() => undefined}
      rootTestID={`ride-guide-${request.routeId}`}
      showFavorite={false}
      showServiceAlerts={false}
      testPrefix="ride-guide"
    />
    </>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  picker: { marginTop: 14, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.surface },
  pickerDot: { width: 14, height: 14, borderWidth: 4, borderRadius: 7 },
  pickerCopy: { minWidth: 0, flex: 1 },
  pickerLabel: { color: colors.mutedInk, ...typography.metadata },
  pickerStop: { color: colors.ink, ...typography.bodyStrong, fontSize: 16, fontFamily: fontFamilies.extraBold },
  pickerHint: { marginTop: 3, color: colors.mutedInk, ...typography.metadata },
  pickerList: { paddingTop: 8 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 540, maxHeight: '80%', alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, backgroundColor: colors.surface },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { flex: 1, color: colors.ink, ...typography.screenHeading, fontSize: 21 },
  stopRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16 },
  rail: { width: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 4, height: '50%' },
  railTop: { top: 0 },
  railBottom: { bottom: 0 },
  stopDot: { zIndex: 1, width: 14, height: 14, borderWidth: 4, borderRadius: 7, backgroundColor: colors.surface },
  stopName: { minWidth: 0, flex: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  stopNameSelected: { fontFamily: fontFamilies.extraBold },
  stopTime: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 14, fontVariant: ['tabular-nums'] },
  stopTimeSelected: { color: colors.ink, fontFamily: fontFamilies.extraBold },
});
