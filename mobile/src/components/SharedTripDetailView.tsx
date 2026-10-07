import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { routes } from '../data/transit';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { DetailMapPage } from './DetailMapPage';
import { Icon } from './Icon';
import { MapBackdrop } from './MapBackdrop';
import { RouteBadge } from './RouteBadge';
import { DestinationPin, orientLegs, routeFocus, RouteLines, type MapLeg } from './RouteMapOverlay';
import { PressableScale } from './PressableScale';

const MAP_HEIGHT = 360;

export type TripDetailLeg = {
  agency: string;
  routeId: string;
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
  isFavorite: boolean;
  model: TripDetailModel;
  onAction: () => void;
  onBack: () => void;
  onToggleFavorite: () => void;
  rootTestID: string;
  testPrefix: 'search-trip' | 'recent-trip';
  tone?: 'planned' | 'recent';
};

function MapControl({ children, label, onPress, selected, testID }: { children: ReactNode; label: string; onPress: () => void; selected?: boolean; testID: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <PressableScale accessibilityLabel={label} accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress} style={[styles.roundButton, selected && styles.selectedControl]} testID={testID}>
      {children}
    </PressableScale>
  );
}

export function SharedTripDetailView({ actionLabel, backLabel, isFavorite, model, onAction, onBack, onToggleFavorite, rootTestID, testPrefix, tone = 'planned' }: SharedTripDetailViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const ease = useLayoutEase();
  const { width } = useWindowDimensions();
  const routeColor = model.legs[0]?.color ?? colors.primary;
  const isEndAction = actionLabel.startsWith('End');

  // This view only ever shows legs from the static demo catalog (its own illustrative map
  // path), never a dynamically-discovered route — a `.find` (rather than `routeById[id]`)
  // keeps the lookup type-safe without assuming `leg.routeId` is one of its exhaustive ids.
  const legPaths = orientLegs(model.legs.map((leg) => routes.find((route) => route.id === leg.routeId)?.mapPath ?? []));
  const mapLegs: MapLeg[] = model.legs.map((leg, index) => {
    const path = legPaths[index]!;
    return {
      color: leg.color,
      path,
      stops: [
        { label: index === 0 ? leg.startName : undefined, point: path[0]! },
        { label: index === model.legs.length - 1 ? leg.endName : undefined, point: path.at(-1)! },
      ],
    };
  });
  const destination = legPaths.at(-1)?.at(-1);

  const map = (
    <MapBackdrop
      focus={routeFocus(legPaths)}
      initialSize={{ width: Math.min(width, 540), height: MAP_HEIGHT }}
      padding={{ top: 76, right: 24, bottom: 36, left: 24 }}
      renderMarkers={(projection) => (destination ? <DestinationPin color={model.legs.at(-1)?.color ?? routeColor} point={destination} projection={projection} /> : null)}
      renderOverlay={({ scale }) => <RouteLines legs={mapLegs} scale={scale} showConnectors={true} showStart={true} />}
      showUserLocation={true}
    />
  );

  const controls = (
    <View pointerEvents="box-none" style={styles.topBar}>
      <MapControl label={backLabel} onPress={onBack} testID={`${testPrefix}-back`}><Icon name="back" size={26} /></MapControl>
      <View style={styles.mapActions}>
        <MapControl label={isFavorite ? 'Remove trip from favorites' : 'Add trip to favorites'} onPress={onToggleFavorite} selected={isFavorite} testID={`${testPrefix}-favorite`}><Icon color={isFavorite ? colors.warning : colors.primary} filled={isFavorite} name="favorite" size={24} /></MapControl>
        <MapControl label="Center trip map on current location" onPress={() => setIsLocationCentered(true)} selected={isLocationCentered} testID={`${testPrefix}-location`}><Icon filled={isLocationCentered} name="locate" /></MapControl>
      </View>
    </View>
  );

  const action = (
    <PressableScale accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={[styles.goButton, isEndAction && styles.endTripAction]} testID={isEndAction ? `${testPrefix}-end` : `${testPrefix}-go`}>
      <Icon color={colors.onPrimary} filled={true} name={isEndAction ? 'stop' : 'go'} size={20} />
      <Text style={styles.goButtonText}>{isEndAction ? 'END' : 'GO'}</Text>
    </PressableScale>
  );

  return (
    <DetailMapPage
      action={action}
      contentStyle={styles.content}
      contentTestID={`${testPrefix}-content`}
      controls={controls}
      map={map}
      mapHeight={MAP_HEIGHT}
      mapTestID={`${testPrefix}-map`}
      scrollTestID={`${testPrefix}-scroll`}
      testID={rootTestID}
    >
      <ThemedStatusBar />
      <View style={styles.summaryHeader}>
        <View style={styles.modeStrip}>
          {model.legs.map((leg, index) => (
            <View key={`${leg.shortName}-${index}-summary`} style={styles.modeItem}>
              <RouteBadge agency={leg.agency} color={leg.color} shortName={leg.shortName} size="small" />
              {index < model.legs.length - 1 ? <Icon color={colors.mutedInk} name="forward" size={16} style={styles.modeArrow} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.primaryMetrics} testID={`${testPrefix}-summary`}>
          <Text style={styles.fare}>{model.fare}</Text>
          <Text style={styles.metricValue}><Text style={styles.minutes}>{model.durationMinutes}</Text> min</Text>
        </View>
      </View>

      <View style={styles.timeCard}>
        <View><Text style={styles.timeLabel}>Leave</Text><Text style={styles.timeValue} testID={`${testPrefix}-leave-time`}>{model.leaveTime}</Text></View>
        <Icon color={colors.border} name="forward" size={22} />
        <View style={styles.arriveTime}><Text style={styles.timeLabel}>Arrive</Text><Text style={styles.timeValue} testID={`${testPrefix}-arrive-time`}>{model.arriveTime}</Text></View>
      </View>

      <PressableScale accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => {
        ease();
        setAlertsOpen((value) => !value);
      }} style={styles.alertButton} testID={`${testPrefix}-service-alerts`}>
        <Icon color={colors.success} filled={true} name="ok" size={18} style={styles.alertIcon} /><Text style={styles.alertText}>Service alerts</Text><Text style={styles.alertStatus}>No delays</Text><Icon color={colors.mutedInk} name={alertsOpen ? 'collapse' : 'expand'} size={18} style={styles.chevron} />
      </PressableScale>
      {alertsOpen ? <Text style={styles.alertBody}>No active service advisories affect this trip.</Text> : null}

      <View style={styles.steps}>
        {model.legs.map((leg, index) => (
          <View key={`${leg.shortName}-${index}`} accessibilityLabel={`${leg.agency} ${leg.routeName}, ${leg.direction}, ${leg.startTime} to ${leg.endTime}`} accessible={true} style={styles.stepCard} testID={`${testPrefix}-${tone === 'recent' ? 'leg' : 'step'}-${index}`}>
            <View style={styles.stepHeader}>
              <RouteBadge agency={leg.agency} color={leg.color} shortName={leg.shortName} size="large" withModeIcon={true} />
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
    </DetailMapPage>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
 
 
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 14 }, mapActions: { flexDirection: 'row', gap: 10 }, roundButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5 }, selectedControl: { backgroundColor: colors.blueSoft },
  goButton: { minWidth: 104, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, borderWidth: 3, borderColor: colors.blueSoft, borderRadius: 30, backgroundColor: colors.primary, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 9 }, endTripAction: { borderColor: '#992D38', backgroundColor: colors.red }, goButtonPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] }, goButtonText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  content: { padding: 16, paddingTop: 20, paddingBottom: 28, backgroundColor: colors.surfaceMuted }, summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, modeStrip: { flexDirection: 'row', alignItems: 'center' }, modeItem: { flexDirection: 'row', alignItems: 'center' }, modeArrow: { marginHorizontal: 3 }, primaryMetrics: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 14 }, fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 }, metricValue: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 10 }, minutes: { fontSize: 25, lineHeight: 27 },
  timeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 9, elevation: 2 }, timeLabel: { color: colors.primary, ...typography.label, fontSize: 12 }, timeValue: { marginTop: 2, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20, lineHeight: 25 }, arriveTime: { alignItems: 'flex-end' },
  tripContext: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 }, tripContextCopy: { minWidth: 0, flex: 1 }, contextLabel: { color: colors.primary, ...typography.label, fontSize: 9 }, destination: { marginTop: 2, color: colors.ink, ...typography.sectionHeading, fontSize: 19 }, origin: { marginTop: 2, color: colors.mutedInk, ...typography.metadata }, detailNote: { marginTop: 2, color: colors.primary, ...typography.metadata }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.greenSoft }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, statusText: { color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 10 }, recentStatus: { backgroundColor: colors.blueSoft }, recentStatusDot: { backgroundColor: colors.primary }, recentStatusText: { color: colors.primary }, transferLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }, transferCount: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, transferText: { marginLeft: 4, color: colors.mutedInk, ...typography.metadata },
  alertButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.background }, alertIcon: { marginRight: 8 }, alertText: { flex: 1, color: colors.ink, ...typography.bodyStrong }, alertStatus: { color: colors.success, ...typography.metadata }, chevron: { marginLeft: 8, color: colors.mutedInk, fontFamily: fontFamilies.extraBold }, alertBody: { paddingHorizontal: 14, paddingTop: 8, color: colors.mutedInk, ...typography.metadata },
  steps: { gap: 14, marginTop: 14 }, stepCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }, stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, routeCopy: { minWidth: 0, flex: 1 }, stepVerb: { color: colors.primary, ...typography.label, fontSize: 8 }, stepAction: { color: colors.ink, ...typography.routeName, fontSize: 16, lineHeight: 20 }, agency: { marginTop: 1, color: colors.mutedInk, ...typography.metadata, fontSize: 10 }, segmentDuration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, segmentTimeline: { flexDirection: 'row', padding: 15 }, segmentRail: { width: 22, alignItems: 'center' }, segmentDot: { zIndex: 1, width: 17, height: 17, borderWidth: 5, borderRadius: 9, backgroundColor: colors.white }, segmentLine: { width: 4, flex: 1, minHeight: 67 }, stopDetails: { minWidth: 0, flex: 1, gap: 10, marginLeft: 10 }, stopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, stopCopy: { minWidth: 0, flex: 1 }, stopLabel: { color: colors.primary, ...typography.label, fontSize: 8 }, stopName: { marginTop: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 13 }, stopTime: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 14 }, direction: { paddingVertical: 7, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
});
