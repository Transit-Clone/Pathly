import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { itineraries, type RoutePreference } from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { CurrentLocationButton } from './CurrentLocationButton';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { MapBackdrop } from './MapBackdrop';

type RouteResultsViewProps = {
  destination: string;
  onBack: () => void;
};

const preferences: { id: RoutePreference; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'transfers', label: 'Fewer transfers' },
  { id: 'cheapest', label: 'Lowest fare' },
];

const leaveTimes = ['Leave now', 'Leave at 10:30', 'Arrive by 12:00'] as const;

export function RouteResultsView({ destination: initialDestination, onBack }: RouteResultsViewProps) {
  const [origin, setOrigin] = useState('Current location');
  const [destination, setDestination] = useState(initialDestination);
  const [preference, setPreference] = useState<RoutePreference>('fastest');
  const [leaveIndex, setLeaveIndex] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);

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
          </View>
        </SafeAreaView>

        <View style={styles.mapMarker}><CurrentLocationMarker /></View>
        <View style={styles.mapLocation}><CurrentLocationButton /></View>

        <SafeAreaView edges={['bottom']} style={styles.resultsSheet}>
          <View style={styles.handle} />
          <View style={styles.controls}>
            <Pressable
              accessibilityLabel="Change leave time"
              accessibilityRole="button"
              onPress={() => setLeaveIndex((index) => (index + 1) % leaveTimes.length)}
              style={({ pressed }) => [styles.leaveControl, pressed && styles.pressed]}
              testID="leave-time-control"
            >
              <Text style={styles.clock}>◷</Text>
              <Text style={styles.leaveTime}>{leaveTimes[leaveIndex]}</Text>
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
          </View>

          <View style={styles.preferences}>
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
          </View>

          <View style={styles.resultHeading}>
            <Text style={styles.resultTitle}>Best routes</Text>
            <Text accessibilityLiveRegion="polite" style={styles.updated}>
              {refreshCount > 0 ? `Updated now · ${refreshCount}` : 'Updated just now'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
            {orderedItineraries.map((itinerary) => (
              <View key={itinerary.id} style={styles.itinerary} testID={`itinerary-${itinerary.id}`}>
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
                    <Text style={styles.nextRide}>{itinerary.nextRide}</Text>
                  </View>
                  <View style={styles.summary}>
                    <Text style={styles.fare}>{itinerary.fare}</Text>
                    <Text style={styles.duration}>{itinerary.durationMinutes}</Text>
                    <Text style={styles.minuteLabel}>min</Text>
                  </View>
                </View>
                <View style={styles.itineraryFooter}>
                  <Text style={styles.transferText}>
                    {itinerary.transfers} {itinerary.transfers === 1 ? 'transfer' : 'transfers'}
                  </Text>
                  <Text style={styles.detailsLink}>View trip  ›</Text>
                </View>
              </View>
            ))}
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
  criteriaCard: { minWidth: 0, flex: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
  endpointRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11 },
  endpointDot: { width: 10, height: 10, borderRadius: 5 },
  endpointConnector: { width: 2, height: 7, marginLeft: 4, backgroundColor: colors.border },
  endpointInput: { minWidth: 0, flex: 1, paddingVertical: 7, color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  mapMarker: { position: 'absolute', top: '29%', left: '48%', zIndex: 1 },
  mapLocation: { position: 'absolute', top: '35%', right: 16, zIndex: 2 },
  resultsSheet: { position: 'absolute', top: '44%', right: 0, bottom: 0, left: 0, overflow: 'hidden', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  handle: { width: 42, height: 5, alignSelf: 'center', marginTop: 9, borderRadius: 3, backgroundColor: colors.border },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 9, paddingHorizontal: 14 },
  leaveControl: { minHeight: 42, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 21, backgroundColor: colors.background },
  clock: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  leaveTime: { color: colors.ink, ...typography.bodyStrong, fontSize: 12 },
  refreshButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.blueSoft },
  refreshIcon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 21 },
  preferences: { flexDirection: 'row', gap: 7, paddingTop: 9, paddingHorizontal: 14 },
  preference: { minHeight: 36, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  selectedPreference: { borderColor: colors.primary, backgroundColor: colors.primary },
  preferenceText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 10, textAlign: 'center' },
  selectedPreferenceText: { color: colors.white },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 16 },
  resultTitle: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  updated: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  results: { gap: 8, padding: 12, paddingTop: 9, paddingBottom: 30 },
  itinerary: { padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  itineraryTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  segmentColumn: { minWidth: 0, flex: 1 },
  recommended: { marginBottom: 5, color: colors.primary, ...typography.label, fontSize: 8 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  segmentGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segmentBadge: { minWidth: 32, height: 29, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 7 },
  segmentText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 11 },
  arrow: { color: colors.mutedInk, fontFamily: fontFamilies.extraBold, fontSize: 16 },
  nextRide: { marginTop: 6, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  summary: { minWidth: 58, alignItems: 'flex-end' },
  fare: { color: colors.primary, ...typography.metadata, fontSize: 10 },
  duration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 26, lineHeight: 28 },
  minuteLabel: { color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  itineraryFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  transferText: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  detailsLink: { color: colors.primary, ...typography.bodyStrong, fontSize: 10 },
  pressed: { opacity: 0.62 },
});
