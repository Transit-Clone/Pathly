import { useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { MapBackdrop } from './MapBackdrop';

export type TripDetailLeg = {
  agency: string;
  color: string;
  direction: string;
  durationMinutes: number;
  endLabel: string;
  endName: string;
  endTime: string;
  routeName: string;
  shortName: string;
  startLabel: string;
  startName: string;
  startTime: string;
};

export type TripDetailModel = {
  arriveTime: string;
  contextLabel: string;
  destination: string;
  detailNote?: string;
  durationMinutes: number;
  fare: string;
  id: string;
  leaveTime: string;
  legs: readonly TripDetailLeg[];
  origin: string;
  statusLabel: string;
  transferCount: number;
};

type SharedTripDetailViewProps = {
  actionLabel: string;
  backLabel: string;
  model: TripDetailModel;
  onAction: () => void;
  onBack: () => void;
  rootTestID: string;
  testPrefix: 'search-trip' | 'recent-trip';
  tone?: 'planned' | 'recent';
};

function CrosshairIcon() {
  return (
    <View style={styles.crosshair}>
      <View style={[styles.crosshairTick, styles.crosshairTickTop]} />
      <View style={[styles.crosshairTick, styles.crosshairTickRight]} />
      <View style={[styles.crosshairTick, styles.crosshairTickBottom]} />
      <View style={[styles.crosshairTick, styles.crosshairTickLeft]} />
      <View style={styles.crosshairCenter} />
    </View>
  );
}

function MapControl({ children, label, onPress, selected, testID }: { children: ReactNode; label: string; onPress: () => void; selected?: boolean; testID: string }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress} style={({ pressed }) => [styles.roundButton, selected && styles.selectedControl, pressed && styles.pressed]} testID={testID}>
      {children}
    </Pressable>
  );
}

export function SharedTripDetailView({ actionLabel, backLabel, model, onAction, onBack, rootTestID, testPrefix, tone = 'planned' }: SharedTripDetailViewProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const routeColor = model.legs[0]?.color ?? colors.primary;

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={rootTestID}>
        <StatusBar style="dark" />
        <ScrollView bounces={false} contentContainerStyle={styles.page} overScrollMode="never" showsVerticalScrollIndicator={false} testID={`${testPrefix}-scroll`}>
          <View style={styles.map} testID={`${testPrefix}-map`}>
            <MapBackdrop />
            {model.legs.map((leg, index) => (
              <View key={`${leg.shortName}-${index}-map`} style={[styles.routeLine, { backgroundColor: leg.color, top: `${56 - index * 7}%`, transform: [{ rotate: `${-13 + index * 8}deg` }] }]} />
            ))}
            <View style={[styles.routeEndpoint, styles.routeStart, { borderColor: routeColor }]} />
            <View style={[styles.routeEndpoint, styles.routeEnd, { borderColor: model.legs.at(-1)?.color ?? routeColor }]} />
            <View style={[styles.userMarker, isLocationCentered && styles.userMarkerCentered]}><View style={styles.userMarkerCore} /></View>

            <SafeAreaView edges={['top']} style={styles.topBar}>
              <MapControl label={backLabel} onPress={onBack} testID={`${testPrefix}-back`}><Text style={styles.backIcon}>‹</Text></MapControl>
              <View style={styles.mapActions}>
                <MapControl label={isFavorite ? 'Remove trip from favorites' : 'Add trip to favorites'} onPress={() => setIsFavorite((value) => !value)} selected={isFavorite} testID={`${testPrefix}-favorite`}><Text style={[styles.favoriteIcon, isFavorite && styles.favoriteIconSelected]}>{isFavorite ? '★' : '☆'}</Text></MapControl>
                <MapControl label="Center trip map on current location" onPress={() => setIsLocationCentered(true)} selected={isLocationCentered} testID={`${testPrefix}-location`}><CrosshairIcon /></MapControl>
              </View>
            </SafeAreaView>

            <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.goButton, actionLabel.startsWith('End') && styles.endTripAction, pressed && styles.goButtonPressed]} testID={actionLabel.startsWith('End') ? `${testPrefix}-end` : `${testPrefix}-go`}>
              <Text style={styles.goButtonText}>{actionLabel.startsWith('End') ? 'END TRIP' : 'GO'}</Text>
            </Pressable>
          </View>

          <SafeAreaView edges={['bottom']} style={styles.content} testID={`${testPrefix}-content`}>
            <View style={styles.summaryHeader}>
              <View style={styles.modeStrip}>
                {model.legs.map((leg, index) => (
                  <View key={`${leg.shortName}-${index}-summary`} style={styles.modeItem}>
                    <View style={[styles.modeBadge, { backgroundColor: leg.color }]}><Text style={styles.modeBadgeText}>{leg.shortName}</Text></View>
                    {index < model.legs.length - 1 ? <Text style={styles.modeArrow}>›</Text> : null}
                  </View>
                ))}
              </View>
              <View style={styles.primaryMetrics} testID={`${testPrefix}-summary`}>
                <Text style={styles.fare}>{model.fare}</Text>
                <Text style={styles.metricValue}><Text style={styles.minutes}>{model.durationMinutes}</Text> min</Text>
              </View>
            </View>

            <View style={styles.timeCard}>
              <View><Text style={styles.timeLabel}>LEAVE</Text><Text style={styles.timeValue} testID={`${testPrefix}-leave-time`}>{model.leaveTime}</Text></View>
              <View style={styles.arriveTime}><Text style={styles.timeLabel}>ARRIVE</Text><Text style={styles.timeValue} testID={`${testPrefix}-arrive-time`}>{model.arriveTime}</Text></View>
            </View>

            {/* <View style={styles.tripContext}>
              <View style={styles.tripContextCopy}>
                <Text style={styles.contextLabel}>{model.contextLabel}</Text>
                <Text numberOfLines={2} style={styles.destination} testID={`${testPrefix}-destination`}>{model.destination}</Text>
                <Text style={styles.origin}>From {model.origin}</Text>
                {model.detailNote ? <Text style={styles.detailNote}>{model.detailNote}</Text> : null}
              </View>
              <View style={[styles.status, tone === 'recent' && styles.recentStatus]}><View style={[styles.statusDot, tone === 'recent' && styles.recentStatusDot]} /><Text style={[styles.statusText, tone === 'recent' && styles.recentStatusText]}>{model.statusLabel}</Text></View>
            </View> */}

            {/* <View style={styles.transferLine}><Text style={styles.transferCount}>{model.transferCount}</Text><Text style={styles.transferText}>{model.transferCount === 1 ? 'transfer' : 'transfers'}</Text></View> */}

            <Pressable accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => setAlertsOpen((value) => !value)} style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]} testID={`${testPrefix}-service-alerts`}>
              <View style={styles.alertDot} /><Text style={styles.alertText}>Service alerts</Text><Text style={styles.alertStatus}>No delays</Text><Text style={styles.chevron}>{alertsOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {alertsOpen ? <Text style={styles.alertBody}>No active service advisories affect this trip.</Text> : null}

            <View style={styles.steps}>
              {model.legs.map((leg, index) => (
                <View key={`${leg.shortName}-${index}`} accessibilityLabel={`${leg.agency} ${leg.routeName}, ${leg.direction}, ${leg.startTime} to ${leg.endTime}`} accessible={true} style={styles.stepCard} testID={`${testPrefix}-${tone === 'recent' ? 'leg' : 'step'}-${index}`}>
                  <View style={styles.stepHeader}>
                    <View style={[styles.routeBadge, { backgroundColor: leg.color }]}><Text style={styles.routeBadgeText}>{leg.shortName}</Text></View>
                    <View style={styles.routeCopy}><Text style={styles.stepVerb}>{index === 0 ? 'BOARD' : 'TRANSFER TO'}</Text><Text style={styles.stepAction}>{leg.routeName}</Text><Text style={styles.agency}>{leg.agency}</Text></View>
                    <Text style={styles.segmentDuration}>{leg.durationMinutes} min</Text>
                  </View>
                  <View style={styles.segmentTimeline}>
                    <View style={styles.segmentRail}><View style={[styles.segmentDot, { borderColor: leg.color }]} /><View style={[styles.segmentLine, { backgroundColor: leg.color }]} /><View style={[styles.segmentDot, { borderColor: leg.color }]} /></View>
                    <View style={styles.stopDetails}>
                      <View style={styles.stopRow}><View style={styles.stopCopy}><Text style={styles.stopLabel}>{leg.startLabel}</Text><Text style={styles.stopName}>{leg.startName}</Text></View><Text style={styles.stopTime}>{leg.startTime}</Text></View>
                      <Text style={styles.direction}>{leg.direction}</Text>
                      <View style={styles.stopRow}><View style={styles.stopCopy}><Text style={styles.stopLabel}>{leg.endLabel}</Text><Text style={styles.stopName}>{leg.endName}</Text></View><Text style={styles.stopTime}>{leg.endTime}</Text></View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </SafeAreaView>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background }, screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas }, page: { backgroundColor: '#F2F6FB', paddingBottom: 12 },
  map: { height: 360, overflow: 'visible', backgroundColor: colors.blueSoft }, routeLine: { position: 'absolute', left: '11%', width: '78%', height: 7, borderRadius: 4 }, routeEndpoint: { position: 'absolute', width: 21, height: 21, borderWidth: 6, borderRadius: 11, backgroundColor: colors.white }, routeStart: { top: '67%', left: '10%' }, routeEnd: { top: '35%', right: '9%' }, userMarker: { position: 'absolute', top: '27%', right: '8%', width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#CBE6FF', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 5, elevation: 4 }, userMarkerCentered: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent }, userMarkerCore: { width: 15, height: 15, borderWidth: 3, borderColor: colors.white, borderRadius: 8, backgroundColor: colors.primary },
  topBar: { position: 'absolute', top: 0, right: 0, left: 0, zIndex: 5, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 14 }, mapActions: { flexDirection: 'row', gap: 10 }, roundButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5 }, selectedControl: { backgroundColor: colors.blueSoft }, backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 35, lineHeight: 37 }, favoriteIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 32, lineHeight: 35 }, favoriteIconSelected: { color: colors.warning }, crosshair: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.primary, borderRadius: 13 }, crosshairCenter: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, crosshairTick: { position: 'absolute', width: 3, height: 7, borderRadius: 2, backgroundColor: colors.primary }, crosshairTickTop: { top: -6 }, crosshairTickRight: { right: -4, top: 6, transform: [{ rotate: '90deg' }] }, crosshairTickBottom: { bottom: -6 }, crosshairTickLeft: { left: -4, top: 6, transform: [{ rotate: '90deg' }] },
  goButton: { position: 'absolute', zIndex: 8, right: 18, bottom: 16, minWidth: 100, height: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, borderWidth: 3, borderColor: colors.blueSoft, borderRadius: 30, backgroundColor: colors.primary, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 9 }, endTripAction: { borderColor: '#992D38', backgroundColor: colors.red }, goButtonPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] }, goButtonText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  content: { minHeight: 520, padding: 16, paddingTop: 20, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: '#F2F6FB', shadowColor: colors.shadow, shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 8 }, summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, modeStrip: { flexDirection: 'row', alignItems: 'center' }, modeItem: { flexDirection: 'row', alignItems: 'center' }, modeBadge: { minWidth: 34, height: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 8 }, modeBadgeText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 12 }, modeArrow: { marginHorizontal: 5, color: colors.mutedInk, fontFamily: fontFamilies.extraBold, fontSize: 22 }, primaryMetrics: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 14 }, fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 }, metricValue: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 10 }, minutes: { fontSize: 25, lineHeight: 27 },
  timeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 9, elevation: 2 }, timeLabel: { color: colors.primary, ...typography.label, fontSize: 9 }, timeValue: { marginTop: 2, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20, lineHeight: 25 }, arriveTime: { alignItems: 'flex-end' },
  tripContext: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 }, tripContextCopy: { minWidth: 0, flex: 1 }, contextLabel: { color: colors.primary, ...typography.label, fontSize: 9 }, destination: { marginTop: 2, color: colors.ink, ...typography.sectionHeading, fontSize: 19 }, origin: { marginTop: 2, color: colors.mutedInk, ...typography.metadata }, detailNote: { marginTop: 2, color: colors.primary, ...typography.metadata }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.greenSoft }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, statusText: { color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 10 }, recentStatus: { backgroundColor: colors.blueSoft }, recentStatusDot: { backgroundColor: colors.primary }, recentStatusText: { color: colors.primary }, transferLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }, transferCount: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, transferText: { marginLeft: 4, color: colors.mutedInk, ...typography.metadata },
  alertButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.background }, alertDot: { width: 9, height: 9, marginRight: 9, borderRadius: 5, backgroundColor: colors.success }, alertText: { flex: 1, color: colors.ink, ...typography.bodyStrong }, alertStatus: { color: colors.success, ...typography.metadata }, chevron: { marginLeft: 8, color: colors.mutedInk, fontFamily: fontFamilies.extraBold }, alertBody: { paddingHorizontal: 14, paddingTop: 8, color: colors.mutedInk, ...typography.metadata },
  steps: { gap: 14, marginTop: 14 }, stepCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }, stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, routeBadge: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10 }, routeBadgeText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 14 }, routeCopy: { minWidth: 0, flex: 1 }, stepVerb: { color: colors.primary, ...typography.label, fontSize: 8 }, stepAction: { color: colors.ink, ...typography.routeName, fontSize: 16, lineHeight: 20 }, agency: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 10 }, segmentDuration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, segmentTimeline: { flexDirection: 'row', padding: 15 }, segmentRail: { width: 22, alignItems: 'center' }, segmentDot: { zIndex: 1, width: 17, height: 17, borderWidth: 5, borderRadius: 9, backgroundColor: colors.white }, segmentLine: { width: 4, flex: 1, minHeight: 67 }, stopDetails: { minWidth: 0, flex: 1, gap: 10, marginLeft: 10 }, stopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, stopCopy: { minWidth: 0, flex: 1 }, stopLabel: { color: colors.primary, ...typography.label, fontSize: 8 }, stopName: { marginTop: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 13 }, stopTime: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 14 }, direction: { paddingVertical: 7, color: colors.mutedInk, ...typography.metadata, fontSize: 11 }, pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
