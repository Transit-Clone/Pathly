import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  itineraries,
  type RoutePreference,
} from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';

type RouteResultsViewProps = {
  destination: string;
  onBack: () => void;
};

const preferences: { id: RoutePreference; label: string }[] = [
  { id: 'fastest', label: 'Fastest' },
  { id: 'transfers', label: 'Less transfers' },
  { id: 'cheapest', label: 'Cheapest' },
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
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="route-results-view">
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to destination search"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="results-back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headingCopy}>
            <Text style={styles.title}>Route Results</Text>
            <Text style={styles.prototypeLabel}>Prototype recommendations</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="Change leave time"
              accessibilityRole="button"
              onPress={() => setLeaveIndex((index) => (index + 1) % leaveTimes.length)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              testID="leave-time-control"
            >
              <Text style={styles.icon}>◷</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Refresh route results"
              accessibilityRole="button"
              onPress={() => setRefreshCount((count) => count + 1)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              testID="refresh-results"
            >
              <Text style={styles.icon}>↻</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.criteriaCard}>
            <View style={styles.endpointRow}>
              <View style={[styles.endpointDot, { backgroundColor: colors.success }]} />
              <TextInput
                accessibilityLabel="Trip origin"
                onChangeText={setOrigin}
                placeholder="Start"
                style={styles.endpointInput}
                testID="origin-input"
                value={origin}
              />
            </View>
            <View style={styles.connector} />
            <View style={styles.endpointRow}>
              <View style={[styles.endpointDot, { backgroundColor: colors.primary }]} />
              <TextInput
                accessibilityLabel="Trip destination"
                onChangeText={setDestination}
                placeholder="Destination"
                style={styles.endpointInput}
                testID="destination-input"
                value={destination}
              />
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.leaveTime}>{leaveTimes[leaveIndex]}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.updated}>
              {refreshCount > 0 ? `Updated now · ${refreshCount}` : 'Updated just now'}
            </Text>
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

          <View style={styles.results}>
            {orderedItineraries.map((itinerary) => (
              <View key={itinerary.id} style={styles.itinerary} testID={`itinerary-${itinerary.id}`}>
                <View style={styles.itineraryTop}>
                  <View style={styles.segmentColumn}>
                    {itinerary.recommended ? (
                      <Text style={styles.recommended}>RECOMMENDED</Text>
                    ) : null}
                    <View style={styles.segmentRow}>
                      {itinerary.segments.map((segment, index) => (
                        <View key={`${segment.shortName}-${index}`} style={styles.segmentGroup}>
                          <View style={[styles.segmentBadge, { backgroundColor: segment.color }]}>
                            <Text style={styles.segmentText}>{segment.shortName}</Text>
                          </View>
                          {index < itinerary.segments.length - 1 ? (
                            <Text style={styles.arrow}>›</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                    <Text style={styles.transferText}>
                      {itinerary.transfers} {itinerary.transfers === 1 ? 'transfer' : 'transfers'}
                    </Text>
                  </View>
                  <View style={styles.summary}>
                    <Text style={styles.duration}>{itinerary.durationMinutes} min</Text>
                    <Text style={styles.fare}>{itinerary.fare}</Text>
                  </View>
                </View>
                <View style={styles.timeline}>
                  <View
                    style={[
                      styles.timelineFill,
                      { width: `${Math.max(40, 100 - itinerary.durationMinutes / 2)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.nextRide}>{itinerary.nextRide}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, backgroundColor: colors.background },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 33, lineHeight: 35 },
  headingCopy: { minWidth: 0, flex: 1 },
  title: { color: colors.ink, ...typography.sectionHeading, fontSize: 22 },
  prototypeLabel: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  headerActions: { flexDirection: 'row', gap: 7 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  icon: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 21 },
  pressed: { opacity: 0.62 },
  content: { padding: 16, paddingBottom: 34 },
  criteriaCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  endpointRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  endpointDot: { width: 11, height: 11, borderRadius: 6 },
  endpointInput: { minWidth: 0, flex: 1, paddingVertical: 10, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  connector: { width: 2, height: 12, marginLeft: 5, backgroundColor: colors.border },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 4 },
  leaveTime: { color: colors.primary, ...typography.bodyStrong, fontSize: 12 },
  updated: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  preferences: { flexDirection: 'row', gap: 7, marginTop: 16 },
  preference: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 21, backgroundColor: colors.surface },
  selectedPreference: { borderColor: colors.primary, backgroundColor: colors.primary },
  preferenceText: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 11, textAlign: 'center' },
  selectedPreferenceText: { color: colors.white },
  results: { gap: 12, marginTop: 18 },
  itinerary: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 7, elevation: 2 },
  itineraryTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  segmentColumn: { minWidth: 0, flex: 1 },
  recommended: { marginBottom: 8, color: colors.primary, ...typography.label, fontSize: 9 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  segmentGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segmentBadge: { minWidth: 36, height: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 9 },
  segmentText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 12 },
  arrow: { color: colors.mutedInk, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  transferText: { marginTop: 7, color: colors.mutedInk, ...typography.metadata },
  summary: { alignItems: 'flex-end' },
  duration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20 },
  fare: { marginTop: 4, color: colors.mutedInk, ...typography.bodyStrong },
  timeline: { height: 5, overflow: 'hidden', marginTop: 15, borderRadius: 3, backgroundColor: colors.border },
  timelineFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  nextRide: { marginTop: 7, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
});
