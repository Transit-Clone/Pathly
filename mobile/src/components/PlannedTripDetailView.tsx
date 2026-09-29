import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Itinerary } from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { MapBackdrop } from './MapBackdrop';

type PlannedTripDetailViewProps = {
  destination: string;
  isActive: boolean;
  itinerary: Itinerary;
  onBack: () => void;
  onEnd: () => void;
  onStart: () => void;
};

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hr ${remainingMinutes} min`;
}

export function PlannedTripDetailView({
  destination,
  isActive,
  itinerary,
  onBack,
  onEnd,
  onStart,
}: PlannedTripDetailViewProps) {
  const routeColor = itinerary.segments[0]?.color ?? colors.primary;

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={`search-trip-detail-${itinerary.id}`}>
        <StatusBar style="dark" />

        <View style={styles.map}>
          <MapBackdrop />
          <View style={[styles.routeLine, { backgroundColor: routeColor }]} />
          <View style={[styles.routeEndpoint, styles.routeStart, { borderColor: routeColor }]} />
          <View style={[styles.routeEndpoint, styles.routeEnd, { borderColor: routeColor }]} />
        </View>

        <SafeAreaView edges={['top']} style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back to route results"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="search-trip-back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        </SafeAreaView>

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>{isActive ? 'ACTIVE TRIP' : 'TRIP PLAN'}</Text>
                <Text numberOfLines={2} style={styles.title} testID="search-trip-destination">
                  {destination}
                </Text>
                <Text style={styles.origin}>From Current location</Text>
              </View>
              <View style={styles.headingActions}>
                <View
                  accessibilityLabel={isActive ? 'Trip in progress' : 'Trip ready to start'}
                  accessibilityLiveRegion="polite"
                  style={[styles.status, isActive && styles.activeStatus]}
                  testID="search-trip-status"
                >
                  <View style={[styles.statusDot, isActive && styles.activeStatusDot]} />
                  <Text style={[styles.statusText, isActive && styles.activeStatusText]}>
                    {isActive ? 'In progress' : 'Ready'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={isActive ? 'End current trip' : `Start trip to ${destination}`}
                  accessibilityRole="button"
                  onPress={isActive ? onEnd : onStart}
                  style={({ pressed }) => [
                    styles.tripAction,
                    isActive && styles.endTripAction,
                    pressed && styles.pressed,
                  ]}
                  testID={isActive ? 'search-trip-end' : 'search-trip-go'}
                >
                  <Text style={styles.tripActionText}>{isActive ? 'End trip' : 'Go'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.summary} testID="search-trip-summary">
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{formatDuration(itinerary.durationMinutes)}</Text>
                <Text style={styles.summaryLabel}>Duration</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{itinerary.fare}</Text>
                <Text style={styles.summaryLabel}>Fare</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{itinerary.transfers}</Text>
                <Text style={styles.summaryLabel}>
                  {itinerary.transfers === 1 ? 'Transfer' : 'Transfers'}
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Trip itinerary</Text>
              <Text style={styles.departure}>{isActive ? 'Started now' : itinerary.nextRide}</Text>
            </View>

            <View style={styles.steps}>
              {itinerary.segments.map((segment, index) => (
                <View
                  key={`${segment.shortName}-${index}`}
                  accessibilityLabel={`${segment.agency} ${segment.routeName}, ${segment.direction} toward ${segment.destination}`}
                  accessible={true}
                  style={styles.step}
                  testID={`search-trip-step-${index}`}
                >
                  <View style={styles.railColumn}>
                    <View style={[styles.railDot, { borderColor: segment.color }]} />
                    {index < itinerary.segments.length - 1 ? (
                      <View style={[styles.rail, { backgroundColor: segment.color }]} />
                    ) : null}
                  </View>
                  <View style={styles.stepCard}>
                    <View style={[styles.routeBadge, { backgroundColor: segment.color }]}>
                      <Text style={styles.routeBadgeText}>{segment.shortName}</Text>
                    </View>
                    <View style={styles.routeCopy}>
                      <Text style={styles.routeName}>{segment.routeName}</Text>
                      <Text style={styles.agency}>{segment.agency}</Text>
                      <Text style={styles.direction}>
                        {segment.direction} toward {segment.destination}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  map: { height: '38%', overflow: 'hidden', backgroundColor: colors.blueSoft },
  routeLine: { position: 'absolute', top: '57%', left: '13%', width: '76%', height: 8, borderRadius: 4, transform: [{ rotate: '-13deg' }] },
  routeEndpoint: { position: 'absolute', width: 20, height: 20, borderWidth: 6, borderRadius: 10, backgroundColor: colors.white },
  routeStart: { top: '66%', left: '12%' },
  routeEnd: { top: '42%', right: '10%' },
  topBar: { position: 'absolute', top: 0, right: 0, left: 0, zIndex: 4, paddingTop: 8, paddingHorizontal: 14 },
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 33, lineHeight: 35 },
  sheet: { position: 'absolute', top: '31%', right: 0, bottom: 0, left: 0, overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  handle: { width: 42, height: 5, alignSelf: 'center', marginTop: 10, borderRadius: 3, backgroundColor: colors.border },
  content: { padding: 18, paddingTop: 13, paddingBottom: 36 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { minWidth: 0, flex: 1 },
  headingActions: { alignItems: 'stretch', gap: 8 },
  eyebrow: { color: colors.primary, ...typography.label, fontSize: 9 },
  title: { marginTop: 3, color: colors.ink, ...typography.screenHeading, fontSize: 25, lineHeight: 30 },
  origin: { marginTop: 2, color: colors.mutedInk, ...typography.bodyStrong, fontSize: 12 },
  status: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.blueSoft },
  activeStatus: { backgroundColor: colors.greenSoft },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  activeStatusDot: { backgroundColor: colors.success },
  statusText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 10 },
  activeStatusText: { color: colors.success },
  tripAction: { minWidth: 104, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary },
  endTripAction: { backgroundColor: colors.red },
  tripActionText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  summary: { flexDirection: 'row', alignItems: 'stretch', marginTop: 18, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  summaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  summaryValue: { color: colors.ink, ...typography.bodyStrong, fontSize: 14, textAlign: 'center' },
  summaryLabel: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 20, marginBottom: 12 },
  sectionTitle: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  departure: { minWidth: 0, flex: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 9, textAlign: 'right' },
  steps: { gap: 2 },
  step: { minHeight: 88, flexDirection: 'row' },
  railColumn: { width: 24, alignItems: 'center' },
  railDot: { zIndex: 1, width: 17, height: 17, borderWidth: 5, borderRadius: 9, backgroundColor: colors.white },
  rail: { width: 4, flex: 1, minHeight: 70 },
  stepCard: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10, marginBottom: 12, padding: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.background },
  routeBadge: { minWidth: 42, height: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10 },
  routeBadgeText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  routeCopy: { minWidth: 0, flex: 1 },
  routeName: { color: colors.ink, ...typography.bodyStrong, fontSize: 13 },
  agency: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  direction: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  pressed: { opacity: 0.62 },
});
