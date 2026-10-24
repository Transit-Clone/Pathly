import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  guidanceForNavigation,
  type ActiveTripRuntime,
  type NavigationCheckpoint,
  type NavigationCursor,
  type NavigationFix,
  type NormalizedNavigationPlan,
} from '../data/enrouteNavigation';
import { useSupportPrompt } from '../data/supportPrompt';
import { navigationMapProgress } from '../data/tripMap';
import { badgeMode, formatDurationMinutes, formatTripClock, tripMinutes } from '../data/tripPlanning';
import { useClock } from '../hooks/useClock';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { ConfirmDialog } from './ConfirmDialog';
import { DetailMapPage } from './DetailMapPage';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';
import { RouteBadge } from './RouteBadge';
import { SupportCard } from './SupportCard';
import { TripMap } from './TripMap';

const MAP_HEIGHT = 390;
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

export type EnrouteLocationState = 'located' | 'loading' | 'unavailable' | 'stale' | 'poor-accuracy' | 'off-route';

type EnrouteNavigationViewProps = {
  cursor: NavigationCursor;
  fix: NavigationFix | null;
  followFix?: NavigationFix | null;
  isAdmin: boolean;
  locationState: EnrouteLocationState;
  onBack: () => void;
  onDemoCheckpoint?: (checkpoint: NavigationCheckpoint, index: number) => void;
  onEnd: () => void;
  onResetDemo?: () => void;
  plan: NormalizedNavigationPlan;
  session: ActiveTripRuntime;
};

type EnrouteRecoveryViewProps = {
  destination: string;
  loading?: boolean;
  onBack: () => void;
  onEnd: () => void;
  onRetry: () => void;
};

function RoundControl({ children, label, onPress, selected, testID }: { children: ReactNode; label: string; onPress: () => void; selected?: boolean; testID: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={[styles.roundButton, selected && styles.selectedControl]}
      testID={testID}
    >
      {children}
    </PressableScale>
  );
}

const locationCopy: Record<Exclude<EnrouteLocationState, 'located'>, string> = {
  loading: 'Updating your location…',
  unavailable: 'Live location is unavailable. Keeping your last confirmed step.',
  stale: 'Your last location is old. Keeping your last confirmed step while we update it.',
  'poor-accuracy': 'Location accuracy is too low to confirm the next step yet.',
  'off-route': "We can't match this location to the planned route yet.",
};

type FormattedCopy = { accessible: string; visible: string };

function relativeTimeCopy(iso: string, now: number): FormattedCopy {
  const differenceMs = Date.parse(iso) - now;
  if (differenceMs > 30_000) {
    const minutes = Math.max(1, Math.ceil(differenceMs / 60_000));
    return { accessible: `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`, visible: `in ${minutes} min` };
  }
  if (differenceMs >= -30_000) return { accessible: 'now', visible: 'now' };
  const minutes = Math.max(1, Math.floor(Math.abs(differenceMs) / 60_000));
  return { accessible: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`, visible: `${minutes} min ago` };
}

function distanceCopy(meters: number): FormattedCopy {
  const miles = meters / METERS_PER_MILE;
  if (miles >= 0.1) {
    const value = miles.toFixed(1);
    return { accessible: `${value} miles`, visible: `${value} mi` };
  }
  const feet = Math.max(50, Math.round((meters * FEET_PER_METER) / 50) * 50);
  return { accessible: `${feet} feet`, visible: `${feet} ft` };
}

function movementMetadata(distanceMeters: number | null, durationSeconds: number | null, phase: 'walking' | 'transferring'): FormattedCopy | null {
  const distance = distanceMeters === null ? null : distanceCopy(distanceMeters);
  const minutes = durationSeconds === null ? null : tripMinutes(durationSeconds);
  const duration = minutes === null ? null : formatDurationMinutes(minutes);
  const visible = [distance?.visible, duration?.visible].filter(Boolean).join(' · ');
  if (!visible) return null;
  const action = phase === 'walking' ? 'Walking' : 'Transfer';
  const accessible = [
    distance ? `${action} distance ${distance.accessible}` : null,
    duration === null ? null : `estimated ${action.toLowerCase()} time ${duration.accessibility}`,
  ].filter(Boolean).join('. ');
  return { accessible: `${accessible}.`, visible };
}

/** The map-first foreground navigation experience driven by the pure progress engine. */
export function EnrouteNavigationView({ cursor, fix, followFix, isAdmin, locationState, onBack, onDemoCheckpoint, onEnd, onResetDemo, plan, session }: EnrouteNavigationViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const now = useClock(30_000);
  const guidance = useMemo(() => guidanceForNavigation(plan, cursor), [cursor, plan]);
  const mapProgress = useMemo(() => navigationMapProgress(plan, cursor), [cursor, plan]);
  const currentStep = session.itinerary.steps[cursor.stepIndex];
  const currentTransitStep = currentStep?.kind === 'transit' ? currentStep : null;
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const supportPrompt = useSupportPrompt(session.sessionId, guidance.phase === 'arrived');
  const [centerRequest, setCenterRequest] = useState(1);
  const [following, setFollowing] = useState(true);
  const [demoIndex, setDemoIndex] = useState(Math.max(0, cursor.checkpointOrdinal));
  const userLocation = fix ? fix.point : null;
  const routeColor = guidance.line?.color ?? colors.primary;
  const arrivalContext = relativeTimeCopy(guidance.arrivalTime, now);
  const departureContext = guidance.departureTime ? relativeTimeCopy(guidance.departureTime, now) : null;
  const stepMetadata = guidance.phase === 'walking' || guidance.phase === 'transferring'
    ? movementMetadata(guidance.distanceMeters, guidance.durationSeconds, guidance.phase)
    : null;
  const departureAccessibility = guidance.phase === 'waiting-to-board' && guidance.departureTime && departureContext
    ? `Selected departure ${formatTripClock(guidance.departureTime)}, ${departureContext.accessible}. `
    : '';
  const movementAccessibility = stepMetadata ? `${stepMetadata.accessible} ` : '';
  const remainingStopsAccessibility = guidance.remainingStops === null
    ? ''
    : `${guidance.remainingStops} ${guidance.remainingStops === 1 ? 'stop' : 'stops'} remaining. `;

  const moveDemo = (index: number) => {
    const bounded = Math.max(0, Math.min(plan.checkpoints.length - 1, index));
    const checkpoint = plan.checkpoints[bounded];
    if (!checkpoint) return;
    setDemoIndex(bounded);
    onDemoCheckpoint?.(checkpoint, bounded);
  };

  const controls = (
    <View pointerEvents="box-none" style={styles.topBar}>
      <RoundControl label="Back to Home; navigation will stay active" onPress={onBack} testID="enroute-back"><Icon name="back" size={26} /></RoundControl>
      <RoundControl
        label="Follow current location"
        onPress={() => {
          setFollowing(true);
          setCenterRequest((value) => value + 1);
        }}
        selected={following}
        testID="enroute-location"
      >
        <Icon filled={following} name="locate" size={23} />
      </RoundControl>
    </View>
  );

  const action = (
    <PressableScale
      accessibilityLabel="End current trip"
      accessibilityRole="button"
      onPress={() => setConfirmingEnd(true)}
      style={styles.endButton}
      testID="enroute-end"
    >
      <Icon color={colors.onPrimary} filled={true} name="stop" size={20} />
      <Text style={styles.endText}>END</Text>
    </PressableScale>
  );

  return (
    <>
      <DetailMapPage
        action={action}
        contentStyle={styles.content}
        contentTestID="enroute-content"
        controls={controls}
        interactiveMap={true}
        map={(
          <TripMap
            centerOnUserRequest={centerRequest}
            followLocation={followFix ? followFix.point : null}
            followUser={following}
            interactive={true}
            itinerary={session.itinerary}
            navigationProgress={mapProgress}
            onFollowModeChange={setFollowing}
            onUserPan={() => setFollowing(false)}
            padding={{ top: 82, right: 32, bottom: 72, left: 32 }}
            testID="enroute-trip-map"
            userLocation={userLocation}
            userLocationStale={locationState !== 'located'}
          />
        )}
        mapHeight={MAP_HEIGHT}
        mapTestID="enroute-map"
        scrollTestID="enroute-scroll"
        testID="enroute-navigation-view"
      >
        <ThemedStatusBar />
        <View
          accessibilityLabel={`${guidance.currentAction}. ${departureAccessibility}${movementAccessibility}${guidance.nextAction ? `Next: ${guidance.nextAction}. ` : ''}${remainingStopsAccessibility}Arrive ${formatTripClock(guidance.arrivalTime)}, ${arrivalContext.accessible}.`}
          accessible={true}
          style={styles.guidanceCard}
          testID="enroute-guidance"
        >
          <View style={styles.phaseRow}>
            <Text style={styles.phase}>{guidance.phase.replaceAll('-', ' ').toUpperCase()}</Text>
            <Text style={styles.arrival}>{`Arrive ${formatTripClock(guidance.arrivalTime)} · ${arrivalContext.visible}`}</Text>
          </View>
          <View style={styles.currentRow}>
            {guidance.line ? (
              <RouteBadge
                agency={currentTransitStep?.agency.name ?? ''}
                color={routeColor}
                mode={currentTransitStep ? badgeMode(currentTransitStep) : undefined}
                shortName={guidance.line.shortName ?? guidance.line.name}
                size="large"
                textColor={guidance.line.textColor}
              />
            ) : guidance.phase === 'arrived' ? (
              <Mascot motion="pop" pose="celebrate" size={52} testID="enroute-arrived-mascot" />
            ) : <View style={styles.walkIcon}><Icon color={colors.ink} filled={true} name="travel" size={24} /></View>}
            <View style={styles.currentCopy}>
              <Text style={styles.currentAction} testID="enroute-current-action">{guidance.currentAction}</Text>
              {guidance.headsign ? <Text style={styles.headsign}>{guidance.headsign}</Text> : null}
              {guidance.phase === 'waiting-to-board' && guidance.departureTime && departureContext ? (
                <Text style={styles.stepMetadata} testID="enroute-departure-time">{`Departs ${formatTripClock(guidance.departureTime)} · ${departureContext.visible}`}</Text>
              ) : null}
              {stepMetadata ? <Text style={styles.stepMetadata} testID="enroute-step-metadata">{stepMetadata.visible}</Text> : null}
            </View>
          </View>
          {guidance.nextAction ? (
            <View style={styles.nextCard} testID="enroute-next-card">
              <Text style={styles.nextLabel}>NEXT</Text>
              <Text style={styles.nextAction} testID="enroute-next-action">{guidance.nextAction}</Text>
              {guidance.remainingStops !== null ? <Text style={styles.remaining} testID="enroute-remaining-stops">{`${guidance.remainingStops} ${guidance.remainingStops === 1 ? 'stop' : 'stops'} remaining`}</Text> : null}
            </View>
          ) : null}
          {locationState !== 'located' ? (
            <View accessibilityLiveRegion="polite" style={styles.locationNotice} testID={`enroute-location-${locationState}`}>
              <Icon color={colors.warning} name="alert" size={18} />
              <Text style={styles.locationNoticeText}>{locationCopy[locationState]}</Text>
            </View>
          ) : null}
        </View>

        {supportPrompt.visible ? <SupportCard onDismiss={supportPrompt.dismiss} onDonate={supportPrompt.donate} /> : null}

        <View style={styles.tripSummary}>
          <Text style={styles.summaryLabel}>ACTIVE TRIP</Text>
          <Text style={styles.summaryDestination}>{session.destination.label}</Text>
          <Text style={styles.summaryOrigin}>{`From ${session.origin.label}`}</Text>
        </View>

        {isAdmin && onDemoCheckpoint && onResetDemo ? (
          <View style={styles.demoPanel} testID="enroute-demo-controls">
            <View style={styles.demoHeadingRow}>
              <View>
                <Text style={styles.demoLabel}>ADMIN DEMO</Text>
                <Text style={styles.demoTitle}>Trip checkpoints</Text>
              </View>
              <PressableScale accessibilityLabel="Reset trip simulation" accessibilityRole="button" onPress={() => {
                setDemoIndex(0);
                onResetDemo();
              }} style={styles.demoReset} testID="enroute-demo-reset">
                <Icon name="refresh" size={16} />
                <Text style={styles.demoResetText}>Reset</Text>
              </PressableScale>
            </View>
            <ScrollView contentContainerStyle={styles.checkpointList} horizontal={true} showsHorizontalScrollIndicator={false}>
              {plan.checkpoints.map((checkpoint, index) => (
                <PressableScale
                  key={checkpoint.key}
                  accessibilityLabel={`Move mock location to ${checkpoint.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: index === demoIndex }}
                  onPress={() => moveDemo(index)}
                  style={[styles.checkpoint, index === demoIndex && styles.selectedCheckpoint]}
                  testID={`enroute-demo-checkpoint-${index}`}
                >
                  <Text style={[styles.checkpointText, index === demoIndex && styles.selectedCheckpointText]}>{checkpoint.label}</Text>
                </PressableScale>
              ))}
            </ScrollView>
            <View style={styles.demoActions}>
              <PressableScale accessibilityLabel="Previous demo checkpoint" accessibilityRole="button" disabled={demoIndex === 0} onPress={() => moveDemo(demoIndex - 1)} style={[styles.demoStep, demoIndex === 0 && styles.disabled]} testID="enroute-demo-previous">
                <Icon name="back" size={18} /><Text style={styles.demoStepText}>Previous</Text>
              </PressableScale>
              <Text style={styles.demoCount}>{`${demoIndex + 1} / ${plan.checkpoints.length}`}</Text>
              <PressableScale accessibilityLabel="Next demo checkpoint" accessibilityRole="button" disabled={demoIndex >= plan.checkpoints.length - 1} onPress={() => moveDemo(demoIndex + 1)} style={[styles.demoStep, demoIndex >= plan.checkpoints.length - 1 && styles.disabled]} testID="enroute-demo-next">
                <Text style={styles.demoStepText}>Next</Text><Icon name="forward" size={18} />
              </PressableScale>
            </View>
          </View>
        ) : null}
      </DetailMapPage>
      <ConfirmDialog
        body="You'll stop following this trip. It will be saved in Recents."
        confirmLabel="End trip"
        destructive={true}
        onCancel={() => setConfirmingEnd(false)}
        onConfirm={() => {
          setConfirmingEnd(false);
          onEnd();
        }}
        testID="enroute-end-confirm"
        title="End this trip?"
        visible={confirmingEnd}
      />
    </>
  );
}

/** Safe relaunch state when the exact selected itinerary cannot currently be reproduced. */
export function EnrouteRecoveryView({ destination, loading = false, onBack, onEnd, onRetry }: EnrouteRecoveryViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  return (
    <View style={styles.recoveryViewport} testID="enroute-recovery-view">
      <ThemedStatusBar />
      <SafeAreaView edges={['top', 'bottom']} style={styles.recoverySafeArea}>
        <RoundControl label="Back to Home; trip recovery will stay available" onPress={onBack} testID="enroute-recovery-back"><Icon name="back" size={26} /></RoundControl>
        <View accessibilityLiveRegion="polite" style={styles.recoveryCard}>
          <View style={styles.recoveryIcon}><Icon color={colors.warning} name="alert" size={30} /></View>
          <Text style={styles.recoveryEyebrow}>TRIP RECOVERY</Text>
          <Text style={styles.recoveryTitle}>We can’t restore the exact route yet</Text>
          <Text style={styles.recoveryBody}>{`Your trip to ${destination} is still saved. Retry when you’re online, or end it without switching you to a different route.`}</Text>
          <PressableScale
            accessibilityLabel="Retry restoring the exact route"
            accessibilityRole="button"
            disabled={loading}
            onPress={onRetry}
            style={[styles.recoveryPrimary, loading && styles.disabled]}
            testID="enroute-recovery-retry"
          >
            {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Icon color={colors.onPrimary} name="refresh" size={19} />}
            <Text style={styles.recoveryPrimaryText}>{loading ? 'Retrying…' : 'Retry exact route'}</Text>
          </PressableScale>
          <PressableScale accessibilityRole="button" onPress={() => setConfirmingEnd(true)} style={styles.recoveryEnd} testID="enroute-recovery-end">
            <Text style={styles.recoveryEndText}>End this trip</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
      <ConfirmDialog
        body="This saved active trip will be moved to Recents as ended early."
        confirmLabel="End trip"
        destructive={true}
        onCancel={() => setConfirmingEnd(false)}
        onConfirm={() => {
          setConfirmingEnd(false);
          onEnd();
        }}
        testID="enroute-recovery-end-confirm"
        title="End this trip?"
        visible={confirmingEnd}
      />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 52 },
  recoveryViewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  recoverySafeArea: { width: '100%', maxWidth: 540, flex: 1, padding: 16, backgroundColor: colors.canvas },
  recoveryCard: { marginTop: 80, alignItems: 'center', padding: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  recoveryIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: colors.amberSoft },
  recoveryEyebrow: { marginTop: 18, color: colors.warning, ...typography.label },
  recoveryTitle: { marginTop: 5, color: colors.ink, ...typography.sectionHeading, fontSize: 22, textAlign: 'center' },
  recoveryBody: { marginTop: 10, color: colors.mutedInk, ...typography.body, lineHeight: 22, textAlign: 'center' },
  recoveryPrimary: { minHeight: 50, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22, borderRadius: 25, backgroundColor: colors.primary },
  recoveryPrimaryText: { color: colors.onPrimary, ...typography.bodyStrong },
  recoveryEnd: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 20 },
  recoveryEndText: { color: colors.red, ...typography.bodyStrong },
  topBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 16 },
  roundButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 5 },
  selectedControl: { backgroundColor: colors.blueSoft },
  endButton: { minWidth: 104, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18, borderRadius: 26, backgroundColor: colors.red, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 7 },
  endText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 16, letterSpacing: 0.7 },
  guidanceCard: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  phaseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  phase: { color: colors.primary, ...typography.label },
  arrival: { color: colors.ink, ...typography.bodyStrong },
  currentRow: { marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 13 },
  walkIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: colors.blueSoft },
  currentCopy: { flex: 1, minWidth: 0 },
  currentAction: { color: colors.ink, ...typography.sectionHeading, fontSize: 21 },
  headsign: { marginTop: 2, color: colors.mutedInk, ...typography.body },
  stepMetadata: { marginTop: 4, color: colors.primary, ...typography.metadata, fontVariant: ['tabular-nums'] },
  nextCard: { marginTop: 17, padding: 13, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  nextLabel: { color: colors.mutedInk, ...typography.label },
  nextAction: { marginTop: 3, color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  remaining: { marginTop: 2, color: colors.primary, ...typography.metadata },
  locationNotice: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 13, backgroundColor: colors.amberSoft },
  locationNoticeText: { flex: 1, color: colors.ink, ...typography.metadata },
  tripSummary: { marginTop: 14, padding: 17, borderRadius: 20, backgroundColor: colors.surfaceMuted },
  summaryLabel: { color: colors.mutedInk, ...typography.label },
  summaryDestination: { marginTop: 2, color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  summaryOrigin: { marginTop: 2, color: colors.mutedInk, ...typography.body },
  demoPanel: { marginTop: 14, padding: 15, borderWidth: 1, borderColor: colors.accent, borderRadius: 20, backgroundColor: colors.blueSoft },
  demoHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  demoLabel: { color: colors.primary, ...typography.label },
  demoTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  demoReset: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, backgroundColor: colors.surface },
  demoResetText: { color: colors.primary, ...typography.metadata },
  checkpointList: { gap: 8, paddingVertical: 12 },
  checkpoint: { maxWidth: 170, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  selectedCheckpoint: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkpointText: { color: colors.ink, ...typography.metadata },
  selectedCheckpointText: { color: colors.onPrimary },
  demoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  demoStep: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, borderRadius: 20, backgroundColor: colors.surface },
  demoStepText: { color: colors.primary, ...typography.bodyStrong, fontSize: 13 },
  demoCount: { color: colors.mutedInk, ...typography.metadata },
  disabled: { opacity: 0.4 },
});
