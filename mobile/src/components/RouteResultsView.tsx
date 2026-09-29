import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  itineraries,
  itineraryById,
  type ItineraryId,
  type RoutePreference,
} from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { CurrentLocationButton } from './CurrentLocationButton';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { MapBackdrop } from './MapBackdrop';
import { PlannedTripDetailView } from './PlannedTripDetailView';

type RouteResultsViewProps = {
  activeItineraryId: ItineraryId | null;
  destination: string;
  onBack: () => void;
  onCloseTrip: () => void;
  onEndTrip: () => void;
  onOpenTrip: (itineraryId: ItineraryId) => void;
  onStartTrip: (itineraryId: ItineraryId) => void;
  selectedItineraryId: ItineraryId | null;
};

const preferences: { id: RoutePreference; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'transfers', label: 'Fewer transfers' },
  { id: 'cheapest', label: 'Lowest fare' },
];

const leaveTimes = ['Leave now', 'Leave at 10:30', 'Arrive by 12:00'] as const;

export function RouteResultsView({
  activeItineraryId,
  destination: initialDestination,
  onBack,
  onCloseTrip,
  onEndTrip,
  onOpenTrip,
  onStartTrip,
  selectedItineraryId,
}: RouteResultsViewProps) {
  const [origin, setOrigin] = useState('Current location');
  const [destination, setDestination] = useState(initialDestination);
  const [preference, setPreference] = useState<RoutePreference>('fastest');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [leaveIndex, setLeaveIndex] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);

  const swapEndpoints = () => {
    setOrigin(destination);
    setDestination(origin);
  };

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

  if (selectedItineraryId) {
    return (
      <PlannedTripDetailView
        destination={destination}
        isActive={activeItineraryId === selectedItineraryId}
        itinerary={itineraryById[selectedItineraryId]}
        onBack={onCloseTrip}
        onEnd={onEndTrip}
        onStart={() => onStartTrip(selectedItineraryId)}
      />
    );
  }

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID="route-results-view">
        <StatusBar style="dark" />
        <MapBackdrop />

        <SafeAreaView edges={['top']} style={styles.topOverlay}>
          <View style={styles.tripRow}>
            <Pressable
              accessibilityLabel="Back to destination search"
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              testID="results-back"
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>

            <View style={styles.criteriaCard}>
              <View style={styles.endpointStack}>
                <View style={styles.endpointRow}>
                  <View style={[styles.endpointDot, { backgroundColor: colors.success }]} />
                  <TextInput
                    accessibilityLabel="Trip origin"
                    onChangeText={setOrigin}
                    placeholder="Start"
                    placeholderTextColor={colors.mutedInk}
                    style={styles.endpointInput}
                    testID="origin-input"
                    value={origin}
                  />
                </View>
                <View style={styles.endpointConnector} />
                <View style={styles.endpointRow}>
                  <View style={[styles.endpointDot, { backgroundColor: colors.primary }]} />
                  <TextInput
                    accessibilityLabel="Trip destination"
                    onChangeText={setDestination}
                    placeholder="Destination"
                    placeholderTextColor={colors.mutedInk}
                    style={styles.endpointInput}
                    testID="destination-input"
                    value={destination}
                  />
                </View>
              </View>
              <Pressable
                accessibilityLabel="Swap origin and destination"
                accessibilityRole="button"
                onPress={swapEndpoints}
                style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
                testID="swap-endpoints"
              >
                <Text style={styles.swapIcon}>⇅</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>

        <View style={styles.mapMarker}><CurrentLocationMarker /></View>
        <View style={styles.mapLocation}><CurrentLocationButton /></View>

        <SafeAreaView edges={['bottom']} style={styles.resultsSheet}>
          <View style={styles.handle} />
          <View style={styles.controls}>
            <Pressable
              accessibilityLabel="Choose transit modes"
              accessibilityRole="button"
              accessibilityState={{ expanded: optionsOpen }}
              onPress={() => setOptionsOpen((open) => !open)}
              style={({ pressed }) => [styles.toolbarPill, pressed && styles.pressed]}
              testID="modes-control"
            >
              <Text style={styles.toolbarPillText}>Modes</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Filter routes"
              accessibilityRole="button"
              accessibilityState={{ expanded: optionsOpen }}
              onPress={() => setOptionsOpen((open) => !open)}
              style={({ pressed }) => [styles.toolbarPill, pressed && styles.pressed]}
              testID="filter-control"
            >
              <Text style={styles.toolbarPillText}>Filter</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Refresh route results"
              accessibilityRole="button"
              onPress={() => setRefreshCount((count) => count + 1)}
              style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
              testID="refresh-results"
            >
              <Text style={styles.refreshIcon}>↻</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Change leave time"
              accessibilityRole="button"
              onPress={() => setLeaveIndex((index) => (index + 1) % leaveTimes.length)}
              style={({ pressed }) => [styles.leaveControl, pressed && styles.pressed]}
              testID="leave-time-control"
            >
              <Text style={styles.clock}>◷</Text>
              <Text style={styles.leaveTime}>
                {leaveIndex === 0 ? 'Leave: Now' : leaveIndex === 1 ? 'Leave: 10:30' : 'Arrive: 12:00'}
              </Text>
            </Pressable>
          </View>

          {optionsOpen ? <View style={styles.preferences}>
            {preferences.map((item) => {
              const selected = item.id === preference;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setPreference(item.id)}
                  style={({ pressed }) => [
                    styles.preference,
                    selected && styles.selectedPreference,
                    pressed && styles.pressed,
                  ]}
                  testID={`preference-${item.id}`}
                >
                  <Text style={[styles.preferenceText, selected && styles.selectedPreferenceText]}>
                    {item.label}
                  </Text>
                </Pressable>
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
            {orderedItineraries.map((itinerary) => {
              const isActive = itinerary.id === activeItineraryId;
              return (
                <View key={itinerary.id} style={styles.itinerary} testID={`itinerary-${itinerary.id}`}>
                  <Pressable
                    accessibilityHint="Opens the complete trip plan"
                    accessibilityLabel={`View trip details to ${destination}, ${itinerary.durationMinutes} minutes, ${itinerary.fare}`}
                    accessibilityRole="button"
                    onPress={() => onOpenTrip(itinerary.id)}
                    style={({ pressed }) => [styles.itineraryPressable, pressed && styles.pressedCard]}
                    testID={`search-result-view-${itinerary.id}`}
                  >
                    <View style={styles.itineraryTop}>
                      <View style={styles.segmentColumn}>
                        {itinerary.recommended ? <Text style={styles.recommended}>BEST MATCH</Text> : null}
                        <View style={styles.segmentRow}>
                          {itinerary.segments.map((segment, index) => (
                            <View key={`${segment.shortName}-${index}`} style={styles.segmentGroup}>
                              <View style={[styles.segmentBadge, { backgroundColor: segment.color }]}>
                                <Text style={styles.segmentText}>{segment.shortName}</Text>
                              </View>
                              {index < itinerary.segments.length - 1 ? <Text style={styles.arrow}>›</Text> : null}
                            </View>
                          ))}
                        </View>
                        <Text style={styles.nextRide}>
                          {itinerary.nextRide} · {itinerary.transfers}{' '}
                          {itinerary.transfers === 1 ? 'transfer' : 'transfers'}
                        </Text>
                      </View>
                      <View style={styles.summary}>
                        <Text style={styles.fare}>{itinerary.fare}</Text>
                        <View style={styles.durationGroup}>
                          <Text style={styles.duration}>{itinerary.durationMinutes}</Text>
                          <Text style={styles.minuteLabel}>min</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={isActive ? `End trip to ${destination}` : `Start trip to ${destination}`}
                    accessibilityRole="button"
                    onPress={() => {
                      if (isActive) {
                        onEndTrip();
                      } else {
                        onStartTrip(itinerary.id);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.goButton,
                      isActive && styles.endTripButton,
                      pressed && styles.pressed,
                    ]}
                    testID={isActive ? `search-result-end-${itinerary.id}` : `search-result-go-${itinerary.id}`}
                  >
                    <Text style={styles.goButtonText}>{isActive ? 'End' : 'Go'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  topOverlay: { zIndex: 4 },
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 8, paddingHorizontal: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 33, lineHeight: 35 },
  criteriaCard: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 9, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
  endpointStack: { minWidth: 0, flex: 1 },
  endpointRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11 },
  endpointDot: { width: 10, height: 10, borderRadius: 5 },
  endpointConnector: { width: 2, height: 7, marginLeft: 4, backgroundColor: colors.border },
  endpointInput: { minWidth: 0, flex: 1, paddingVertical: 7, color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  swapButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.blueSoft },
  swapIcon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 20, lineHeight: 22 },
  mapMarker: { position: 'absolute', top: '29%', left: '48%', zIndex: 1 },
  mapLocation: { position: 'absolute', top: '35%', right: 16, zIndex: 2 },
  resultsSheet: { position: 'absolute', top: '44%', right: 0, bottom: 0, left: 0, overflow: 'hidden', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  handle: { width: 42, height: 5, alignSelf: 'center', marginTop: 9, borderRadius: 3, backgroundColor: colors.border },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingHorizontal: 14 },
  toolbarPill: { height: 36, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  toolbarPillText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 10 },
  leaveControl: { minWidth: 104, height: 36, flex: 1.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 18, backgroundColor: colors.background },
  clock: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  leaveTime: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 9 },
  refreshButton: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surface },
  refreshIcon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 19 },
  preferences: { flexDirection: 'row', gap: 7, paddingTop: 9, paddingHorizontal: 14 },
  preference: { minHeight: 36, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  selectedPreference: { borderColor: colors.primary, backgroundColor: colors.primary },
  preferenceText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 10, textAlign: 'center' },
  selectedPreferenceText: { color: colors.white },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 16 },
  resultTitle: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  updated: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  results: { gap: 8, padding: 12, paddingTop: 9, paddingBottom: 30 },
  itinerary: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  itineraryPressable: { paddingLeft: 12, paddingRight: 72, paddingVertical: 10 },
  pressedCard: { backgroundColor: colors.blueSoft },
  itineraryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmentColumn: { minWidth: 0, flex: 1 },
  recommended: { marginBottom: 5, color: colors.primary, ...typography.label, fontSize: 8 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  segmentGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segmentBadge: { minWidth: 32, height: 29, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 7 },
  segmentText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 11 },
  arrow: { color: colors.mutedInk, fontFamily: fontFamilies.extraBold, fontSize: 16 },
  nextRide: { marginTop: 6, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 11 },
  durationGroup: { alignItems: 'flex-end' },
  duration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 26, lineHeight: 28 },
  minuteLabel: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  goButton: { position: 'absolute', top: '50%', right: 12, zIndex: 2, minWidth: 48, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -16, paddingHorizontal: 9, borderRadius: 9, backgroundColor: colors.primary },
  endTripButton: { backgroundColor: colors.red },
  goButtonText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  pressed: { opacity: 0.62 },
});
