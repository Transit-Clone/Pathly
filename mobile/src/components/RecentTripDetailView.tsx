import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecentTrip } from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { MapBackdrop } from './MapBackdrop';

type RecentTripDetailViewProps = {
  isActive: boolean;
  onBack: () => void;
  onEnd: () => void;
  onStart: () => void;
  trip: RecentTrip;
};

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hr ${remainingMinutes} min`;
}

export function RecentTripDetailView({
  isActive,
  onBack,
  onEnd,
  onStart,
  trip,
}: RecentTripDetailViewProps) {
  const transferCount = Math.max(0, trip.legs.length - 1);
  const routeColor = trip.legs[0]?.color ?? colors.primary;

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={`recent-trip-detail-${trip.id}`}>
        <StatusBar style="dark" />

        <View style={styles.map}>
          <MapBackdrop />
          <View style={[styles.routeLine, { backgroundColor: routeColor }]} />
          <View style={[styles.routeEndpoint, styles.routeStart, { borderColor: routeColor }]} />
          <View style={[styles.routeEndpoint, styles.routeEnd, { borderColor: routeColor }]} />
        </View>

        <SafeAreaView edges={['top']} style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back to Recents"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="recent-trip-back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        </SafeAreaView>

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>{isActive ? 'ACTIVE TRIP' : 'RECENT TRIP'}</Text>
                <Text style={styles.title} testID="recent-trip-destination">
                  {trip.destination}
                </Text>
                <Text style={styles.origin}>From {trip.origin}</Text>
              </View>
              <View style={styles.headingActions}>
                <View
                  accessibilityLabel={isActive ? 'Trip in progress' : 'Trip completed'}
                  accessibilityLiveRegion="polite"
                  style={styles.status}
                  testID="recent-trip-status"
                >
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{isActive ? 'In progress' : 'Completed'}</Text>
                </View>
                <Pressable
                  accessibilityLabel={isActive ? 'End current trip' : `Start trip to ${trip.destination}`}
                  accessibilityRole="button"
                  onPress={isActive ? onEnd : onStart}
                  style={({ pressed }) => [
                    styles.tripAction,
                    isActive && styles.endTripAction,
                    pressed && styles.pressed,
                  ]}
                  testID={isActive ? 'recent-trip-end' : 'recent-trip-go'}
                >
                  <Text style={styles.tripActionText}>{isActive ? 'End trip' : 'Go'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.summary} testID="recent-trip-summary">
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{formatDuration(trip.durationMinutes)}</Text>
                <Text style={styles.summaryLabel}>Duration</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{trip.fare}</Text>
                <Text style={styles.summaryLabel}>Fare</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{transferCount}</Text>
                <Text style={styles.summaryLabel}>{transferCount === 1 ? 'Transfer' : 'Transfers'}</Text>
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <Text numberOfLines={1} style={styles.sectionTitle}>Trip itinerary</Text>
              <Text style={styles.recency}>{isActive ? 'Started now' : trip.recency}</Text>
            </View>

            <View style={styles.timeline}>
              {trip.legs.map((leg, index) => (
                <View
                  key={`${leg.shortName}-${leg.boardTime}`}
                  accessibilityLabel={`${leg.routeName}, ${leg.direction}. Board at ${leg.boardStop} at ${leg.boardTime}. Get off at ${leg.alightStop} at ${leg.alightTime}.`}
                  accessible={true}
                  style={styles.leg}
                  testID={`recent-trip-leg-${index}`}
                >
                  <View style={styles.railColumn}>
                    <View style={[styles.railDot, { borderColor: leg.color }]} />
                    <View style={[styles.rail, { backgroundColor: leg.color }]} />
                    <View style={[styles.railDot, styles.arrivalDot, { borderColor: leg.color }]} />
                  </View>

                  <View style={styles.legContent}>
                    <View style={styles.stopRow}>
                      <View style={styles.stopCopy}>
                        <Text style={styles.stopLabel}>BOARD</Text>
                        <Text style={styles.stopName}>{leg.boardStop}</Text>
                      </View>
                      <Text style={styles.stopTime}>{leg.boardTime}</Text>
                    </View>

                    <View style={styles.routeRow}>
                      <View style={[styles.routeBadge, { backgroundColor: leg.color }]}>
                        <Text style={styles.routeBadgeText}>{leg.shortName}</Text>
                      </View>
                      <View style={styles.routeCopy}>
                        <Text style={styles.routeName}>{leg.routeName}</Text>
                        <Text style={styles.direction}>{leg.direction}</Text>
                      </View>
                    </View>

                    <View style={styles.stopRow}>
                      <View style={styles.stopCopy}>
                        <Text style={styles.stopLabel}>GET OFF</Text>
                        <Text style={styles.stopName}>{leg.alightStop}</Text>
                      </View>
                      <Text style={styles.stopTime}>{leg.alightTime}</Text>
                    </View>

                    {index < trip.legs.length - 1 ? (
                      <Text style={styles.transferNote}>Transfer to the next route</Text>
                    ) : null}
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
  status: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.greenSoft },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  statusText: { color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 10 },
  tripAction: { minWidth: 104, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary },
  endTripAction: { backgroundColor: colors.red },
  tripActionText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  summary: { flexDirection: 'row', alignItems: 'stretch', marginTop: 18, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  summaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  summaryValue: { color: colors.ink, ...typography.bodyStrong, fontSize: 14, textAlign: 'center' },
  summaryLabel: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 9 },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 12 },
  sectionTitle: { minWidth: 0, flex: 1, color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  recency: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  timeline: { gap: 14 },
  leg: { minHeight: 188, flexDirection: 'row' },
  railColumn: { width: 24, alignItems: 'center' },
  railDot: { zIndex: 1, width: 17, height: 17, borderWidth: 5, borderRadius: 9, backgroundColor: colors.white },
  arrivalDot: { marginTop: -1 },
  rail: { width: 4, flex: 1, minHeight: 126 },
  legContent: { minWidth: 0, flex: 1, gap: 10, paddingLeft: 10, paddingBottom: 4 },
  stopRow: { minHeight: 32, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  stopCopy: { minWidth: 0, flex: 1 },
  stopLabel: { color: colors.mutedInk, ...typography.label, fontSize: 8 },
  stopName: { marginTop: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 13 },
  stopTime: { color: colors.ink, ...typography.bodyStrong, fontSize: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.background },
  routeBadge: { minWidth: 40, height: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10 },
  routeBadgeText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  routeCopy: { minWidth: 0, flex: 1 },
  routeName: { color: colors.ink, ...typography.bodyStrong, fontSize: 13 },
  direction: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  transferNote: { alignSelf: 'flex-start', marginTop: 1, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, color: colors.primary, ...typography.metadata, fontSize: 9, backgroundColor: colors.blueSoft },
  pressed: { opacity: 0.62 },
});
