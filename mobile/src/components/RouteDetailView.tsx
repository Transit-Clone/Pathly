import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RouteDetail } from '../data/transit';
import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { LiveSignal } from './LiveSignal';

type RouteDetailViewProps = {
  onBack: () => void;
  route: RouteDetail;
};

export function RouteDetailView({ onBack, route }: RouteDetailViewProps) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={`route-detail-${route.id}`}>
        <StatusBar style="dark" />
        <View style={styles.map}>
          <View style={[styles.routePath, { backgroundColor: route.color }]} />
          {route.mapLabels.map((label, index) => (
            <View
              key={label}
              style={[styles.mapStop, { left: `${10 + index * 19}%`, top: 112 + (index % 2) * 42 }]}
            >
              <View style={[styles.mapDot, { borderColor: route.color }]} />
              <Text style={styles.mapLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <SafeAreaView edges={['top']} style={styles.topBar}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="route-back"
          >
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.topActions}>
            <Pressable
              accessibilityLabel="Show current location"
              accessibilityRole="button"
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              testID="route-location"
            >
              <Text style={styles.iconText}>◎</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={isPinned ? 'Unpin route' : 'Pin route'}
              accessibilityRole="button"
              accessibilityState={{ selected: isPinned }}
              onPress={() => setIsPinned((value) => !value)}
              style={({ pressed }) => [
                styles.iconButton,
                isPinned && { backgroundColor: route.color },
                pressed && styles.pressed,
              ]}
              testID="route-pin"
            >
              <Text style={[styles.iconText, isPinned && styles.pinnedIcon]}>◆</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.titleRow}>
              <View
                style={[styles.routeBadge, { backgroundColor: route.color }]}
                testID="route-detail-badge"
              >
                <Text style={styles.routeBadgeText}>{route.shortName}</Text>
              </View>
              <View style={styles.titleCopy}>
                <Text style={styles.agency}>{route.agency}</Text>
                <Text style={styles.title}>{route.routeName}</Text>
                <Text style={styles.direction}>
                  {route.direction} · toward {route.destination}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>UPCOMING</Text>
            <View style={styles.predictions}>
              {route.predictions.map((prediction) => (
                <View
                  key={`${prediction.minutes}-${prediction.live}`}
                  accessibilityLabel={`${prediction.minutes} minutes, ${prediction.live ? 'live GPS prediction' : 'scheduled time'}`}
                  accessible={true}
                  style={[styles.prediction, !prediction.live && styles.scheduled]}
                  testID={`route-prediction-${prediction.minutes}`}
                >
                  <View style={styles.predictionRow}>
                    <Text style={[styles.predictionTime, { color: route.color }]}>
                      {prediction.minutes}
                    </Text>
                    {prediction.live ? <LiveSignal color={route.color} /> : null}
                  </View>
                  <Text style={[styles.predictionUnit, { color: route.color }]}>minutes</Text>
                  <Text style={styles.predictionSource}>
                    {prediction.live ? 'Live' : 'Scheduled'}
                  </Text>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityLabel="Service alerts"
              accessibilityRole="button"
              accessibilityState={{ expanded: alertsOpen }}
              onPress={() => setAlertsOpen((value) => !value)}
              style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]}
              testID="service-alerts"
            >
              <View style={[styles.alertDot, { backgroundColor: route.alert.startsWith('No delays') ? colors.success : colors.warning }]} />
              <Text style={styles.alertText}>Service alerts</Text>
              <Text style={styles.alertStatus}>
                {route.alert.startsWith('No delays') ? 'No delays' : 'Advisory'}
              </Text>
              <Text style={styles.chevron}>{alertsOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {alertsOpen ? <Text style={styles.alertBody}>{route.alert}</Text> : null}

            <View style={styles.timelineHeading}>
              <Text style={styles.timelineTitle}>Route stops</Text>
              <View style={styles.onTimeChip}>
                <View style={styles.onTimeDot} />
                <Text style={styles.onTimeText}>On time</Text>
              </View>
            </View>

            <View accessibilityLabel="Stops for the next departure">
              {route.stops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === route.stops.length - 1;
                return (
                  <View
                    key={stop.name}
                    accessibilityLabel={`${stop.name}, ${isFirst ? 'departs' : 'arrives'} ${stop.time}`}
                    accessible={true}
                    style={styles.stopRow}
                  >
                    <View style={styles.timelineRail}>
                      {!isFirst ? <View style={[styles.rail, styles.railTop, { backgroundColor: route.color }]} /> : null}
                      <View
                        style={[
                          styles.stopDot,
                          { borderColor: route.color },
                          isFirst && { backgroundColor: route.color },
                        ]}
                      />
                      {!isLast ? <View style={[styles.rail, styles.railBottom, { backgroundColor: route.color }]} /> : null}
                    </View>
                    <View style={styles.stopCopy}>
                      <Text style={styles.stopName}>{stop.name}</Text>
                      <Text style={styles.stopMeta}>{isFirst ? 'Departs' : isLast ? 'Final stop' : 'Scheduled stop'}</Text>
                    </View>
                    <Text style={styles.stopTime}>{stop.time}</Text>
                  </View>
                );
              })}
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
  map: { height: 330, overflow: 'hidden', backgroundColor: colors.blueSoft },
  routePath: {
    position: 'absolute',
    top: 148,
    left: '8%',
    width: '84%',
    height: 6,
    borderRadius: 3,
    transform: [{ rotate: '-7deg' }],
  },
  mapStop: { position: 'absolute', width: 74, alignItems: 'center', marginLeft: -20 },
  mapDot: { width: 15, height: 15, borderWidth: 4, borderRadius: 8, backgroundColor: colors.white },
  mapLabel: {
    marginTop: 5,
    color: colors.ink,
    fontFamily: fontFamilies.bold,
    fontSize: 9,
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  backButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderRadius: 23,
    backgroundColor: colors.surface,
  },
  backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 30, lineHeight: 32 },
  backText: { color: colors.primary, ...typography.bodyStrong },
  topActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: colors.surface,
  },
  iconText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 19 },
  pinnedIcon: { color: colors.white },
  pressed: { opacity: 0.65 },
  sheet: {
    position: 'absolute',
    top: 275,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  content: { padding: 20, paddingBottom: 36 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  routeBadge: {
    minWidth: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  routeBadgeText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  titleCopy: { minWidth: 0, flex: 1 },
  agency: { color: colors.mutedInk, ...typography.label },
  title: { color: colors.ink, ...typography.screenHeading, fontSize: 25 },
  direction: { color: colors.mutedInk, ...typography.bodyStrong, fontSize: 13 },
  sectionLabel: { marginTop: 22, marginBottom: 9, color: colors.mutedInk, ...typography.label },
  predictions: { flexDirection: 'row', gap: 8 },
  prediction: {
    minHeight: 104,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 16,
    backgroundColor: colors.blueSoft,
  },
  scheduled: { borderColor: colors.border, backgroundColor: colors.background, opacity: 0.7 },
  predictionRow: { flexDirection: 'row', alignItems: 'center' },
  predictionTime: { fontFamily: fontFamilies.extraBold, fontSize: 28, lineHeight: 34 },
  predictionUnit: { fontFamily: fontFamilies.bold, fontSize: 10 },
  predictionSource: { marginTop: 6, color: colors.mutedInk, ...typography.label, fontSize: 9 },
  alertButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  alertDot: { width: 9, height: 9, marginRight: 9, borderRadius: 5 },
  alertText: { flex: 1, color: colors.ink, ...typography.bodyStrong },
  alertStatus: { color: colors.success, ...typography.metadata },
  chevron: { marginLeft: 8, color: colors.mutedInk, fontFamily: fontFamilies.extraBold },
  alertBody: { paddingHorizontal: 14, paddingTop: 8, color: colors.mutedInk, ...typography.metadata },
  timelineHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 4,
  },
  timelineTitle: { color: colors.ink, ...typography.sectionHeading },
  onTimeChip: { flexDirection: 'row', alignItems: 'center', padding: 7, borderRadius: 10, backgroundColor: colors.greenSoft },
  onTimeDot: { width: 6, height: 6, marginRight: 5, borderRadius: 3, backgroundColor: colors.success },
  onTimeText: { color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 10 },
  stopRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center' },
  timelineRail: { width: 30, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginRight: 5 },
  rail: { position: 'absolute', width: 3, height: '50%' },
  railTop: { top: 0 },
  railBottom: { bottom: 0 },
  stopDot: { zIndex: 1, width: 13, height: 13, borderWidth: 3, borderRadius: 7, backgroundColor: colors.surface },
  stopCopy: { minWidth: 0, flex: 1, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  stopName: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 16 },
  stopMeta: { marginTop: 3, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
  stopTime: { paddingLeft: 10, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 17 },
});
