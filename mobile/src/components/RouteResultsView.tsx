import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { realFareForItinerary } from '../data/lirrFares';
import type { SearchPlace } from '../data/placesSearch';
import {
  formatTripTimeChoice,
  itineraries,
  itineraryById,
  scheduleItinerary,
  type ItineraryId,
  type RoutePreference,
  type TripTimeChoice,
} from '../data/transit';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { ScreenTransition, useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { CurrentLocationButton } from './CurrentLocationButton';
import { Icon, type IconName } from './Icon';
import { LeaveTimeSheet } from './LeaveTimeSheet';
import { MapBackdrop } from './MapBackdrop';
import { PlannedTripDetailView } from './PlannedTripDetailView';
import { RouteBadge, transitModeForAgency, type TransitMode } from './RouteBadge';
import { PressableScale } from './PressableScale';

/** What the rider has chosen on Route Results; kept by HomeScreen so it survives a trip to the search page. */
export type ResultsCriteria = {
  origin: string;
  destination: string;
  /** The searched place behind `destination`, when it came from search; it's what the star saves. */
  destinationPlace?: SearchPlace;
  preference: RoutePreference;
  enabledModes: readonly TransitMode[];
};

export const CURRENT_LOCATION_LABEL = 'Current location';

export function initialResultsCriteria(destination: string, destinationPlace?: SearchPlace): ResultsCriteria {
  return { origin: CURRENT_LOCATION_LABEL, destination, destinationPlace, preference: 'fastest', enabledModes: ['subway', 'bus', 'rail'] };
}

type RouteResultsViewProps = {
  activeItineraryId: ItineraryId | null;
  criteria: ResultsCriteria;
  /** Whether the trip's destination is in the rider's saved locations (the trip page's star). */
  isDestinationSaved: boolean;
  onBack: () => void;
  onChangeCriteria: (criteria: ResultsCriteria) => void;
  onChangeTripTime: (choice: TripTimeChoice) => void;
  onCloseTrip: () => void;
  /** Opens the destination search page to change one endpoint. */
  onEditEndpoint: (field: 'origin' | 'destination') => void;
  onEndTrip: () => void;
  onOpenTrip: (itineraryId: ItineraryId) => void;
  onStartTrip: (itineraryId: ItineraryId) => void;
  onToggleSaveDestination: () => void;
  selectedItineraryId: ItineraryId | null;
  tripTime: TripTimeChoice;
};

const preferences: { id: RoutePreference; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'transfers', label: 'Fewer transfers' },
  { id: 'cheapest', label: 'Lowest fare' },
];

const transitModes: { id: TransitMode; label: string; icon: IconName }[] = [
  { id: 'subway', label: 'Subway', icon: 'subway' },
  { id: 'bus', label: 'Bus', icon: 'bus' },
  { id: 'rail', label: 'Rail', icon: 'rail' },
];

const ALL_MODES: readonly TransitMode[] = ['subway', 'bus', 'rail'];

type OptionsPanel = 'modes' | 'filter' | null;

export function RouteResultsView({
  activeItineraryId,
  criteria,
  isDestinationSaved,
  onBack,
  onChangeCriteria,
  onChangeTripTime,
  onCloseTrip,
  onEditEndpoint,
  onEndTrip,
  onOpenTrip,
  onStartTrip,
  onToggleSaveDestination,
  selectedItineraryId,
  tripTime,
}: RouteResultsViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const { destination, enabledModes, origin, preference } = criteria;
  const setPreference = (next: RoutePreference) => onChangeCriteria({ ...criteria, preference: next });
  const setEnabledModes = (update: readonly TransitMode[] | ((current: readonly TransitMode[]) => readonly TransitMode[])) => (
    onChangeCriteria({ ...criteria, enabledModes: typeof update === 'function' ? update(enabledModes) : update })
  );
  const [openPanel, setOpenPanel] = useState<OptionsPanel>(null);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const swapEndpoints = () => onChangeCriteria({ ...criteria, origin: destination, destination: origin });

  const orderedItineraries = useMemo(
    () =>
      [...itineraries].sort((left, right) => {
        if (left.recommended !== right.recommended) {
          return left.recommended ? -1 : 1;
        }
        if (left.preference === preference && right.preference !== preference) {
          return -1;
        }
        if (right.preference === preference && left.preference !== preference) {
          return 1;
        }
        return left.durationMinutes - right.durationMinutes;
      }),
    [preference],
  );
  const visibleItineraries = orderedItineraries.filter((itinerary) =>
    itinerary.segments.every((segment) => enabledModes.includes(transitModeForAgency(segment.agency))),
  );
  const modesFiltered = enabledModes.length < ALL_MODES.length;

  const ease = useLayoutEase();
  const togglePanel = (panel: Exclude<OptionsPanel, null>) => {
    ease();
    setOpenPanel((current) => (current === panel ? null : panel));
  };
  const toggleMode = (mode: TransitMode) => {
    ease();
    setEnabledModes((current) => {
      if (!current.includes(mode)) return ALL_MODES.filter((item) => item === mode || current.includes(item));
      return current.length === 1 ? current : current.filter((item) => item !== mode);
    });
  };

  if (selectedItineraryId) {
    return (
      <ScreenTransition key="trip">
      <PlannedTripDetailView
        destination={destination}
        isActive={activeItineraryId === selectedItineraryId}
        isFavorite={isDestinationSaved}
        itinerary={itineraryById[selectedItineraryId]}
        onBack={onCloseTrip}
        onEnd={onEndTrip}
        onStart={() => onStartTrip(selectedItineraryId)}
        onToggleFavorite={onToggleSaveDestination}
        schedule={scheduleItinerary(itineraryById[selectedItineraryId], tripTime)}
      />
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition key="list">
    <View style={styles.viewport}>
      <View style={styles.screen} testID="route-results-view">
        <ThemedStatusBar />
        <MapBackdrop padding={{ top: 120, bottom: height * 0.56 }} showUserLocation={true} />

        <SafeAreaView edges={['top']} style={styles.topOverlay}>
          <View style={styles.tripRow}>
            <PressableScale
              accessibilityLabel="Back to destination search"
              accessibilityRole="button"
              onPress={onBack}
              style={styles.backButton}
              testID="results-back"
            >
              <Icon name="back" size={26} />
            </PressableScale>

            <View style={styles.criteriaCard}>
              <View style={styles.endpointStack}>
                <View style={styles.endpointRow}>
                  <View style={[styles.endpointDot, { backgroundColor: colors.success }]} />
                  {/* Each endpoint opens the destination search page, rather than taking typed text. */}
                  <PressableScale
                    accessibilityHint="Opens search to change the start"
                    accessibilityLabel={`Trip origin, ${origin}`}
                    accessibilityRole="button"
                    onPress={() => onEditEndpoint('origin')}
                    style={styles.endpointField}
                    testID="origin-field"
                  >
                    <Text numberOfLines={1} style={styles.endpointInput}>{origin}</Text>
                  </PressableScale>
                </View>
                <View style={styles.endpointConnector} />
                <View style={styles.endpointRow}>
                  <View style={[styles.endpointDot, { backgroundColor: colors.primary }]} />
                  <PressableScale
                    accessibilityHint="Opens search to change the destination"
                    accessibilityLabel={`Trip destination, ${destination}`}
                    accessibilityRole="button"
                    onPress={() => onEditEndpoint('destination')}
                    style={styles.endpointField}
                    testID="destination-field"
                  >
                    <Text numberOfLines={1} style={styles.endpointInput}>{destination}</Text>
                  </PressableScale>
                </View>
              </View>
              <PressableScale
                accessibilityLabel="Swap origin and destination"
                accessibilityRole="button"
                onPress={swapEndpoints}
                style={styles.swapButton}
                testID="swap-endpoints"
              >
                <Icon name="swap" size={20} />
              </PressableScale>
            </View>
          </View>
        </SafeAreaView>

        <View style={styles.mapLocation}><CurrentLocationButton testID="results-location" /></View>

        <SafeAreaView edges={['bottom']} style={styles.resultsSheet}>
          <View style={styles.controls}>
            <PressableScale
              accessibilityLabel="Choose transit modes"
              accessibilityRole="button"
              accessibilityState={{ expanded: openPanel === 'modes' }}
              onPress={() => togglePanel('modes')}
              style={[styles.toolbarPill, (openPanel === 'modes' || modesFiltered) && styles.activePill]}
              testID="modes-control"
            >
              <Icon color={modesFiltered ? colors.primary : colors.ink} name="modes" size={15} />
              <Text style={[styles.toolbarPillText, modesFiltered && styles.activePillText]}>{modesFiltered ? `Modes · ${enabledModes.length}` : 'Modes'}</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Filter routes"
              accessibilityRole="button"
              accessibilityState={{ expanded: openPanel === 'filter' }}
              onPress={() => togglePanel('filter')}
              style={[styles.toolbarPill, openPanel === 'filter' && styles.activePill]}
              testID="filter-control"
            >
              <Icon color={colors.ink} name="filter" size={15} />
              <Text style={styles.toolbarPillText}>Filter</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Refresh route results"
              accessibilityRole="button"
              onPress={() => setRefreshCount((count) => count + 1)}
              style={styles.refreshButton}
              testID="refresh-results"
            >
              <Icon name="refresh" size={19} />
            </PressableScale>
            <PressableScale
              accessibilityLabel="Change leave time"
              accessibilityRole="button"
              onPress={() => setTimeSheetOpen(true)}
              style={[styles.leaveControl, tripTime.mode !== 'now' && styles.activePill]}
              testID="leave-time-control"
            >
              <Icon color={tripTime.mode === 'now' ? colors.ink : colors.primary} name="time" size={16} />
              <Text numberOfLines={1} style={[styles.leaveTime, tripTime.mode !== 'now' && styles.activePillText]} testID="leave-time-label">
                {formatTripTimeChoice(tripTime)}
              </Text>
            </PressableScale>
          </View>

          {openPanel === 'modes' ? <View style={styles.preferences} testID="modes-panel">
            {transitModes.map((item) => {
              const selected = enabledModes.includes(item.id);
              return (
                <PressableScale
                  key={item.id}
                  accessibilityLabel={`${item.label} routes`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleMode(item.id)}
                  style={[styles.preference, styles.modeChip, selected && styles.selectedPreference]}
                  testID={`mode-${item.id}`}
                >
                  <Icon color={selected ? colors.onPrimary : colors.mutedInk} filled={selected} name={item.icon} size={14} />
                  <Text style={[styles.preferenceText, selected && styles.selectedPreferenceText]}>{item.label}</Text>
                </PressableScale>
              );
            })}
          </View> : null}

          {openPanel === 'filter' ? <View style={styles.preferences} testID="filter-panel">
            {preferences.map((item) => {
              const selected = item.id === preference;
              return (
                <PressableScale
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    ease();
                    setPreference(item.id);
                  }}
                  style={[styles.preference,
                    selected && styles.selectedPreference]}
                  testID={`preference-${item.id}`}
                >
                  <Text style={[styles.preferenceText, selected && styles.selectedPreferenceText]}>
                    {item.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View> : null}

          <View style={styles.resultHeading}>
            <Text style={styles.resultTitle}>Best routes</Text>
            <Text accessibilityLiveRegion="polite" style={styles.updated}>
              {refreshCount > 0 ? `Updated now · ${refreshCount}` : 'Updated just now'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
            {visibleItineraries.length === 0 ? (
              <View accessibilityLiveRegion="polite" style={styles.emptyResults} testID="results-empty">
                <Icon color={colors.mutedInk} name="modes" size={28} />
                <Text style={styles.emptyTitle}>No routes match these modes</Text>
                <PressableScale accessibilityRole="button" onPress={() => {
                  ease();
                  setEnabledModes(ALL_MODES);
                }} style={styles.resetButton} testID="results-reset-modes">
                  <Text style={styles.resetText}>Show all modes</Text>
                </PressableScale>
              </View>
            ) : null}
            {visibleItineraries.map((itinerary) => {
              const schedule = scheduleItinerary(itinerary, tripTime);
              const fare = realFareForItinerary(itinerary);
              return (
                <View key={itinerary.id} style={styles.itinerary} testID={`itinerary-${itinerary.id}`}>
                  <PressableScale
                    accessibilityHint="Opens the complete trip plan"
                    accessibilityLabel={`View trip details to ${destination}, ${itinerary.durationMinutes} minutes, ${fare}`}
                    accessibilityRole="button"
                    onPress={() => onOpenTrip(itinerary.id)}
                    style={styles.itineraryPressable}
                    testID={`search-result-view-${itinerary.id}`}
                  >
                    <View style={styles.itineraryTop}>
                      <View style={styles.segmentColumn}>
                        {itinerary.recommended ? <Text style={styles.recommended}>BEST MATCH</Text> : null}
                        <View style={styles.segmentRow}>
                          {itinerary.segments.map((segment, index) => (
                            <View key={`${segment.shortName}-${index}`} style={styles.segmentGroup}>
                              <RouteBadge agency={segment.agency} color={segment.color} shortName={segment.shortName} size="small" />
                              {index < itinerary.segments.length - 1 ? <Icon color={colors.mutedInk} name="forward" size={14} /> : null}
                            </View>
                          ))}
                        </View>
                        <Text style={styles.nextRide} testID={`schedule-${itinerary.id}`}>
                          {schedule.label}
                        </Text>
                      </View>
                      <View style={styles.summary}>
                        <Text style={styles.fare}>{fare}</Text>
                        <View style={styles.durationGroup}>
                          <Text style={styles.duration}>{itinerary.durationMinutes}</Text>
                          <Text style={styles.minuteLabel}>min</Text>
                        </View>
                      </View>
                    </View>
                  </PressableScale>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>

        {timeSheetOpen ? (
          <LeaveTimeSheet
            onCancel={() => setTimeSheetOpen(false)}
            onConfirm={(choice) => {
              onChangeTripTime(choice);
              setTimeSheetOpen(false);
            }}
            value={tripTime}
          />
        ) : null}
      </View>
    </View>
    </ScreenTransition>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  topOverlay: { zIndex: 4 },
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 8, paddingHorizontal: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  criteriaCard: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 9, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
  endpointStack: { minWidth: 0, flex: 1 },
  endpointRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11 },
  endpointDot: { width: 10, height: 10, borderRadius: 5 },
  endpointConnector: { width: 2, height: 7, marginLeft: 4, backgroundColor: colors.border },
  endpointField: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  endpointInput: { minWidth: 0, flex: 1, paddingVertical: 7, color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  swapButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.blueSoft },
  mapLocation: { position: 'absolute', top: '35%', right: 16, zIndex: 2 },
  resultsSheet: { position: 'absolute', top: '44%', right: 0, bottom: 0, left: 0, overflow: 'hidden', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20, paddingHorizontal: 14 },
  toolbarPill: { height: 36, minWidth: 100, flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  toolbarPillText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 10 },
  leaveControl: { color: colors.ink, minWidth: 100, height: 36, flex: 1.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 18, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
  leaveTime: { color: colors.ink, ...typography.bodyStrong, fontSize: 10 },
  refreshButton: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  preferences: { flexDirection: 'row', gap: 7, paddingTop: 9, paddingHorizontal: 14 },
  preference: { minHeight: 36, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  selectedPreference: { borderColor: colors.primary, backgroundColor: colors.primary },
  preferenceText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 10, textAlign: 'center' },
  selectedPreferenceText: { color: colors.onPrimary },
  modeChip: { flexDirection: 'row', gap: 5 },
  activePill: { borderColor: colors.primary, backgroundColor: colors.blueSoft },
  activePillText: { color: colors.primary },
  emptyResults: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, ...typography.bodyStrong },
  resetButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.primary },
  resetText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 16 },
  resultTitle: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  updated: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  results: { gap: 8, padding: 12, paddingTop: 9, paddingBottom: 30 },
  itinerary: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  itineraryPressable: { paddingHorizontal: 12, paddingVertical: 10 },
  itineraryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmentColumn: { minWidth: 0, flex: 1 },
  recommended: { marginBottom: 5, color: colors.primary, ...typography.label, fontSize: 8 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  segmentGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextRide: { marginTop: 6, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 11 },
  durationGroup: { alignItems: 'flex-end' },
  duration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 26, lineHeight: 28 },
  minuteLabel: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
});
