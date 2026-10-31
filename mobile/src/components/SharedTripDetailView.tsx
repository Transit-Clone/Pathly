import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRouteColor } from '../data/routeColors';
import { routes, type ServiceAlert } from '../data/transit';
import type { TripLegNote } from '../data/tripLive';
import { formatDurationMinutes } from '../data/tripPlanning';
import { useClock } from '../hooks/useClock';
import { useViewportSize } from '../hooks/useViewportSize';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { ConfirmDialog } from './ConfirmDialog';
import { DetailMapPage } from './DetailMapPage';
import { Icon } from './Icon';
import { LiveSignal } from './LiveSignal';
import { MapBackdrop } from './MapBackdrop';
import { RouteBadge, type TransitMode } from './RouteBadge';
import { DestinationPin, orientLegs, routeFocus, RouteLines, type MapLeg } from './RouteMapOverlay';
import { MapControlButton } from './MapControlButton';
import { mapPageMapHeight } from './mapSheetLayout';
import { PressableScale } from './PressableScale';
import { TripNotePill } from './TripNotePill';
import { radii } from '../theme/shape';


/** Walking before a leg (or, on the model, after the last one). */
export type TripDetailWalk = { minutes: number; distance: string; toName: string };

/** A stop the leg passes without the rider getting off. */
export type TripDetailStop = { name: string; time: string; point: { lat: number; lng: number } };

/** One departure in a leg's departure box. `key` identifies it to `onSelectDeparture`. */
export type TripDetailDeparture = { key: string; time: string; arriveTime: string; selected: boolean; reachable: boolean };

export type TripDetailLeg = {
  agency: string;
  /** Departures to choose between (planned trips): the box shows a few, and all on request. */
  departures?: readonly TripDetailDeparture[];
  /** The few `departures` shown before "All departures". */
  quickDepartures?: readonly TripDetailDeparture[];
  /** The line's sign, e.g. "Penn Station" (planned trips). */
  headsign?: string;
  /** Badge shape when the agency name alone can't tell (planned trips). */
  mode?: TransitMode;
  /** Stops ridden (planned trips). */
  stopCount?: number;
  /** The stops in between, when known: listed under the stop count, which then expands. */
  stops?: readonly TripDetailStop[];
  /** Badge label color (planned trips). */
  textColor?: string;
  /** The walk to this leg's boarding stop. */
  walkBefore?: TripDetailWalk;
  /** Between the previous leg and this one: minutes waiting for this departure. */
  waitBeforeMinutes?: number;
  /** Live notes: live times, a cancelled trip, a tight or missed connection (planned trips). */
  notes?: readonly TripLegNote[];
  routeId: string;
  color: string;
  direction: string;
  durationMinutes: number;
  endName: string;
  endTime: string;
  routeName: string;
  shortName: string;
  startName: string;
  startTime: string;
  /** The agency's live feed is tracking this ride, so its times follow the real vehicle. */
  live?: boolean;
  /** The line's service alerts (delays, detours, planned work), shown under the ride. */
  alerts?: readonly ServiceAlert[];
};

export type TripDetailModel = {
  arriveTime: string;
  contextLabel: string;
  destination: string;
  /** The destination's address, for the closing card (a searched place's subtitle). */
  destinationAddress?: string;
  /** The destination stop's lines, when it's a transit stop, badged on the closing card. */
  destinationLines?: readonly { agency: string; color: string; mode: TransitMode; shortName: string }[];
  detailNote?: string;
  durationMinutes: number;
  fare: string;
  id: string;
  leaveTime: string;
  /** When the rider has to set off (ISO), for the "Leave within" card; absent hides it. */
  leavesAt?: string;
  legs: readonly TripDetailLeg[];
  origin: string;
  statusLabel: string;
  transferCount: number;
  /** The walk from the last stop to the destination (planned trips). */
  walkAfter?: TripDetailWalk;
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
  /** A real map for the trip; recent trips keep the illustrated one. */
  map?: ReactNode;
  /** Recent trips keep the service-alert row; planned trips have no real alert data for it. */
  showServiceAlerts?: boolean;
  /** The map takes gestures where the content doesn't cover it (planned trips' real map). */
  interactiveMap?: boolean;
  /** A stop row in an expanded list was pressed: the map shows that stop. */
  onFocusStop?: (stop: TripDetailStop) => void;
  /** The location button was pressed: the real map centers on the rider. */
  onCenterOnLocation?: () => void;
  /** Whether the map is centered on the rider (the location button's state), when the map reports it. */
  locationSelected?: boolean;
  /** A departure was picked from a leg's box (by transit leg index). */
  onSelectDeparture?: (legIndex: number, key: string) => void;
  testPrefix: 'search-trip' | 'recent-trip';
  tone?: 'planned' | 'recent';
};

/** Walking gets a card of its own; a transfer between legs adds the wait for the next one. */
function WalkCard({ testID, waitMinutes, walk }: { testID: string; waitMinutes?: number; walk: TripDetailWalk }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const duration = formatDurationMinutes(walk.minutes);
  const wait = waitMinutes !== undefined ? formatDurationMinutes(waitMinutes) : null;
  return (
    <View accessibilityLabel={`Walk ${duration.accessibility}, ${walk.distance}, to ${walk.toName}${wait ? `, then wait ${wait.accessibility}` : ''}`} accessible={true} style={styles.walkCard} testID={testID}>
      <View style={styles.walkIcon}><Icon color={colors.ink} name="travel" size={20} /></View>
      <View style={styles.routeCopy}>
        <Text style={styles.walkTitle}>{`Walk to ${walk.toName}`}</Text>
        <Text style={styles.walkMeta}>{walk.distance}{wait ? ` · then wait ${wait.visible}` : ''}</Text>
      </View>
      <Text style={styles.segmentDuration}>{duration.visible}</Text>
    </View>
  );
}

/**
 * The left edge of a timeline row: the line in the leg's color, through the row or ending at its
 * dot. Boarding and getting off are rings; the stops in between are filled dots on the line.
 */
function Rail({ color, dot, from = true, to = true }: { color: string; dot?: 'terminal' | 'via'; from?: boolean; to?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rail}>
      {from ? <View style={[styles.railLine, styles.railTop, { backgroundColor: color }]} /> : null}
      {to ? <View style={[styles.railLine, styles.railBottom, { backgroundColor: color }]} /> : null}
      {dot === 'terminal' ? <View style={[styles.segmentDot, { borderColor: color }]} /> : null}
      {dot === 'via' ? <View style={[styles.viaDot, { backgroundColor: color }]} /> : null}
    </View>
  );
}

function DepartureChip({ color, departure, live = false, onPress, testID, textColor }: { color: string; departure: TripDetailDeparture; live?: boolean; onPress?: () => void; testID: string; textColor?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityLabel={`Depart ${departure.time}, arrive ${departure.arriveTime}${live ? ', live' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected: departure.selected, disabled: !departure.reachable }}
      disabled={!departure.reachable || !onPress}
      onPress={onPress}
      style={[styles.departureChip, live && styles.departureChipLive, departure.selected && { borderColor: color, backgroundColor: color }, !departure.reachable && styles.departureUnreachable]}
      testID={testID}
    >
      <Text style={[styles.departureChipText, departure.selected && { color: textColor ?? '#FFFFFF' }]}>{departure.time}</Text>
      {/* On the picked (filled) chip the signal takes the label's color so it stays visible. */}
      {live ? <LiveSignal color={departure.selected ? textColor ?? '#FFFFFF' : colors.green} style={styles.departureChipSignal} /> : null}
    </PressableScale>
  );
}

/** A ride's service alerts: one row naming the most pressing, opening onto each alert's details. */
function LegAlerts({ alerts, expanded, onToggle, testID }: { alerts: readonly ServiceAlert[]; expanded: boolean; onToggle: () => void; testID: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  // Disruptions now come before notices and upcoming changes.
  const ordered = [...alerts].sort((a, b) => Number(b.warning ?? true) - Number(a.warning ?? true));
  const summary = ordered[0]?.label ?? 'Service alert';
  return (
    <View style={styles.legAlerts} testID={testID}>
      <PressableScale
        accessibilityLabel={`${summary}${ordered.length > 1 ? `, ${ordered.length} alerts` : ''}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.legAlertsToggle}
        testID={`${testID}-toggle`}
      >
        <View style={styles.legAlertsDot}><Text style={styles.legAlertsMark}>!</Text></View>
        <Text numberOfLines={1} style={styles.legAlertsSummary}>{summary}</Text>
        {ordered.length > 1 ? <Text style={styles.legAlertsCount}>{`+${ordered.length - 1} more`}</Text> : null}
        <Icon color={colors.mutedInk} name={expanded ? 'collapse' : 'expand'} size={14} />
      </PressableScale>
      {expanded ? (
        <View style={styles.legAlertsList} testID={`${testID}-list`}>
          {ordered.map((alert) => (
            <View key={alert.id} style={styles.legAlert}>
              <Text style={styles.legAlertHeader}>{alert.header}</Text>
              {alert.description ? <Text style={styles.legAlertDescription}>{alert.description}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The "Leave within" card shows for trips leaving within this long. */
const LEAVE_WITHIN_HORIZON_MIN = 90;

/**
 * How long the rider has before setting off, counting down: "Leave within 6 min", then "Leave now"
 * (in warning yellow). Live when the first ride's feed is tracking it.
 */
function LeaveWithinCard({ leavesAt, model, testID }: { leavesAt: string; model: TripDetailModel; testID: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const now = useClock(15_000);
  const minutes = Math.round((Date.parse(leavesAt) - now) / 60_000);
  if (!Number.isFinite(minutes) || minutes > LEAVE_WITHIN_HORIZON_MIN) return null;
  const firstLeg = model.legs[0];
  const urgent = minutes <= 1;
  const title = minutes > 0 ? `Leave within ${minutes} min` : 'Leave now';
  return (
    <View accessibilityLabel={`${title}${firstLeg?.live ? ', live' : ''}`} accessible={true} style={[styles.leaveCard, urgent && styles.leaveCardUrgent]} testID={testID}>
      <View style={[styles.leaveIcon, urgent && styles.leaveIconUrgent]}><Icon color={urgent ? colors.onAlertYellow : colors.primary} name="time" size={15} /></View>
      <View style={styles.leaveTitleRow}>
        <Text style={styles.leaveTitle}>{title}</Text>
        {firstLeg?.live ? <LiveSignal color={colors.green} style={styles.leaveSignal} /> : null}
      </View>
    </View>
  );
}

const LINE_MODE_HEADINGS: readonly { mode: TransitMode; title: string }[] = [
  { mode: 'rail', title: 'Rail' },
  { mode: 'subway', title: 'Subway' },
  { mode: 'bus', title: 'Bus' },
  { mode: 'ferry', title: 'Ferry' },
];

/** Every line at the destination stop, from the bottom like Route View's transfers, by mode. */
function DestinationLinesSheet({ lines, onClose, stopName }: { lines: TripDetailModel['destinationLines'] | null; onClose: () => void; stopName: string }) {
  const styles = useThemedStyles(createStyles);
  const tint = useRouteColor();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={true} visible={lines != null}>
      <Pressable accessibilityLabel="Close lines" onPress={onClose} style={styles.sheetBackdrop} testID="destination-lines-backdrop" />
      {lines ? (
        <View style={styles.linesSheet} testID="destination-lines-sheet">
          <View style={styles.linesSheetHeader}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.linesSheetTitle}>{stopName}</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="destination-lines-close"><Icon name="close" size={26} /></PressableScale>
          </View>
          <ScrollView contentContainerStyle={styles.linesSheetContent}>
            {LINE_MODE_HEADINGS.map(({ mode, title }) => {
              const ofMode = lines.filter((line) => line.mode === mode);
              if (ofMode.length === 0) return null;
              return (
                <View key={mode} testID={`destination-lines-${mode}`}>
                  <Text style={styles.linesSheetHeading}>{title}</Text>
                  <View style={styles.linesSheetBadges}>
                    {ofMode.map((line) => <RouteBadge key={line.shortName} agency={line.agency} color={tint(line.color)} mode={line.mode} shortName={line.shortName} />)}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

/** Lines badged on the closing card before the rest are counted ("+4"). */
const MAX_ARRIVAL_BADGES = 6;

type SummaryPart = { kind: 'walk'; minutes: number } | { kind: 'leg'; leg: TripDetailLeg };

/** The trip in order for the header strip: each walk (with its minutes) and each ride. */
function summaryParts(model: TripDetailModel): SummaryPart[] {
  const parts: SummaryPart[] = [];
  for (const leg of model.legs) {
    if (leg.walkBefore) parts.push({ kind: 'walk', minutes: leg.walkBefore.minutes });
    parts.push({ kind: 'leg', leg });
  }
  if (model.walkAfter) parts.push({ kind: 'walk', minutes: model.walkAfter.minutes });
  return parts;
}

/** `color` mixed into `base` by `amount` (0–1): a ride card's light wash of its line color. Non-hex colors give `base`. */
function shade(color: string, base: string, amount: number): string {
  const hex = /^#([0-9a-f]{6})$/i;
  const a = hex.exec(color)?.[1];
  const b = hex.exec(base)?.[1];
  if (!a || !b) return base;
  const channel = (offset: number) => {
    const mixed = Math.round(parseInt(b.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(a.slice(offset, offset + 2), 16) * amount);
    return mixed.toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

export function SharedTripDetailView({ actionLabel, backLabel, interactiveMap = false, isFavorite, locationSelected, map: tripMap, model, onAction, onBack, onCenterOnLocation, onFocusStop, onSelectDeparture, onToggleFavorite, rootTestID, showServiceAlerts = true, testPrefix, tone = 'planned' }: SharedTripDetailViewProps) {
  const tint = useRouteColor();
  const styles = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  // Legs whose stops in between are shown, by index.
  const [expandedLegs, setExpandedLegs] = useState<ReadonlySet<number>>(new Set());
  // Legs whose full departure list is open, by index.
  const [allDeparturesLegs, setAllDeparturesLegs] = useState<ReadonlySet<number>>(new Set());
  const [openAlertLegs, setOpenAlertLegs] = useState<ReadonlySet<number>>(new Set());
  const [destinationLinesOpen, setDestinationLinesOpen] = useState(false);
  const hasDestinationLines = (model.destinationLines?.length ?? 0) > 0;
  const toggleLegAlerts = (index: number) => {
    ease();
    setOpenAlertLegs((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  };
  const toggleAllDepartures = (index: number) => {
    ease();
    setAllDeparturesLegs((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };
  const toggleLeg = (index: number) => {
    ease();
    setExpandedLegs((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };
  const ease = useLayoutEase();
  // The fare and minutes hold the first row's right side at any width (the badges wrap
  // instead); only very large text stacks them under the badges.
  const { fontScale, height, width } = useViewportSize();
  const mapHeight = mapPageMapHeight(height);
  const stackLargeTextMetrics = fontScale >= 1.5;
  const isEndAction = actionLabel.startsWith('End');
  const totalDuration = formatDurationMinutes(model.durationMinutes);

  // This view only ever shows legs from the static demo catalog (its own illustrative map
  // path), never a dynamically-discovered route — a `.find` (rather than `routeById[id]`)
  // keeps the lookup type-safe without assuming `leg.routeId` is one of its exhaustive ids.
  const legPaths = orientLegs(model.legs.map((leg) => routes.find((route) => route.id === leg.routeId)?.mapPath ?? []));
  const mapLegs: MapLeg[] = model.legs.map((leg, index) => {
    const path = legPaths[index]!;
    return {
      color: tint(leg.color),
      path,
      stops: [
        { label: index === 0 ? leg.startName : undefined, point: path[0]! },
        { label: index === model.legs.length - 1 ? leg.endName : undefined, point: path.at(-1)! },
      ],
    };
  });
  const destination = legPaths.at(-1)?.at(-1);

  const map = tripMap ?? (
    <MapBackdrop
      focus={routeFocus(legPaths)}
      initialSize={{ width: Math.min(width, 540), height: mapHeight }}
      padding={{ top: 76, right: 24, bottom: 36, left: 24 }}
      renderMarkers={(projection) => (destination ? <DestinationPin point={destination} projection={projection} /> : null)}
      renderOverlay={({ scale }) => <RouteLines legs={mapLegs} scale={scale} showConnectors={true} showStart={true} />}
      showUserLocation={true}
    />
  );

  const controls = (
    <View pointerEvents="box-none" style={styles.topBar}>
      <MapControlButton accessibilityLabel={backLabel} icon="back" onPress={onBack} testID={`${testPrefix}-back`} />
      <View style={styles.mapActions}>
        <MapControlButton accessibilityLabel={isFavorite ? 'Remove destination from saved' : 'Save destination'} icon="favorite" onPress={onToggleFavorite} selected={isFavorite} testID={`${testPrefix}-favorite`} variant="save" />
        <MapControlButton accessibilityLabel="Center trip map on current location" icon="locate" onPress={() => {
          setIsLocationCentered(true);
          onCenterOnLocation?.();
        }} selected={locationSelected ?? isLocationCentered} testID={`${testPrefix}-location`} />
      </View>
    </View>
  );

  // GO (or END) rides the sheet's top edge and scrolls away with it.
  const action = (
    <PressableScale accessibilityLabel={actionLabel} accessibilityRole="button" onPress={isEndAction ? () => setConfirmingEnd(true) : onAction} style={[styles.goButton, isEndAction && styles.endTripAction]} testID={isEndAction ? `${testPrefix}-end` : `${testPrefix}-go`}>
      <Icon color={colors.onPrimary} name={isEndAction ? 'stop' : 'go'} size={20} />
      <Text style={styles.goButtonText}>{isEndAction ? 'END' : 'GO'}</Text>
    </PressableScale>
  );

  return (
    <DetailMapPage
      action={action}
      actionSticks={false}
      interactiveMap={interactiveMap}
      contentStyle={styles.content}
      contentTestID={`${testPrefix}-content`}
      controls={controls}
      controlsScrollWithMap={true}
      handle={{ accessibilityHint: 'Expands or collapses the trip details.', accessibilityLabel: 'Trip details handle', testID: `${testPrefix}-sheet-handle` }}
      map={map}
      mapHeight={mapHeight}
      mapTestID={`${testPrefix}-map`}
      scrollTestID={`${testPrefix}-scroll`}
      showHeader={false}
      testID={rootTestID}
    >
      <ThemedStatusBar />
      <ConfirmDialog
        body="You'll stop following this trip. You can start it again from its trip details."
        confirmLabel="End trip"
        destructive={true}
        onCancel={() => setConfirmingEnd(false)}
        onConfirm={() => {
          setConfirmingEnd(false);
          onAction();
        }}
        testID={`${testPrefix}-end-confirm`}
        title="End this trip?"
        visible={confirmingEnd}
      />
      <View style={[styles.summaryHeader, stackLargeTextMetrics && styles.summaryHeaderLargeText]} testID={`${testPrefix}-summary-layout`}>
        <View style={[styles.modeStrip, stackLargeTextMetrics && styles.modeStripLargeText]}>
          {/* Every walk with its minutes, transfers' short ones too, so the total walking is clear.
              A long trip wraps its badges onto more rows; the minutes and fare keep their place. */}
          {summaryParts(model).map((part, index, parts) => {
            const walkDuration = part.kind === 'walk' ? formatDurationMinutes(part.minutes) : null;
            return (
              <View key={`${part.kind}-${index}-summary`} style={styles.modeItem}>
                {part.kind === 'walk' && walkDuration ? (
                  <View accessibilityLabel={`Walk ${walkDuration.accessibility}`} accessible={true} style={styles.walkChip} testID={`${testPrefix}-summary-walk-${index}`}>
                    <Icon color={colors.mutedInk} name="travel" size={16} />
                    <Text style={styles.walkChipText}>{part.minutes >= 60 ? walkDuration.visible : part.minutes}</Text>
                  </View>
                ) : part.kind === 'leg' ? <RouteBadge agency={part.leg.agency} alert={!!part.leg.alerts?.length} color={tint(part.leg.color)} mode={part.leg.mode} shortName={part.leg.shortName} size="small" textColor={part.leg.textColor} /> : null}
                {index < parts.length - 1 ? <Icon color={colors.mutedInk} name="forward" size={16} style={styles.modeArrow} /> : null}
              </View>
            );
          })}
        </View>
        <View style={[styles.primaryMetrics, stackLargeTextMetrics && styles.primaryMetricsLargeText]} testID={`${testPrefix}-summary`}>
          <Text style={styles.fare}>{model.fare}</Text>
          <View style={styles.minutesLive}>
            <Text accessibilityLabel={totalDuration.accessibility} style={[styles.metricValue, styles.minutes]} testID={`${testPrefix}-duration`}>{totalDuration.visible}</Text>
            {model.legs.some((leg) => leg.live) ? <LiveSignal color={colors.green} style={styles.minutesSignal} /> : null}
          </View>
        </View>
      </View>

      {model.leavesAt ? <LeaveWithinCard leavesAt={model.leavesAt} model={model} testID={`${testPrefix}-leave-within`} /> : null}
      <View style={styles.timeCard}>
        <View><Text style={styles.timeLabel}>Leave</Text><Text style={styles.timeValue} testID={`${testPrefix}-leave-time`}>{model.leaveTime}</Text></View>
        <Icon color={colors.border} name="forward" size={22} />
        <View style={styles.arriveTime}><Text style={styles.timeLabel}>Arrive</Text><Text style={styles.timeValue} testID={`${testPrefix}-arrive-time`}>{model.arriveTime}</Text></View>
      </View>

      {showServiceAlerts ? (
        <PressableScale accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => {
          ease();
          setAlertsOpen((value) => !value);
        }} style={styles.alertButton} testID={`${testPrefix}-service-alerts`}>
          <Icon color={colors.success} name="ok" size={18} style={styles.alertIcon} /><Text style={styles.alertText}>Service alerts</Text><Text style={styles.alertStatus}>No delays</Text><Icon color={colors.mutedInk} name={alertsOpen ? 'collapse' : 'expand'} size={18} style={styles.chevron} />
        </PressableScale>
      ) : null}
      {showServiceAlerts && alertsOpen ? <Text style={styles.alertBody}>No active service advisories affect this trip.</Text> : null}

      <View style={styles.steps}>
        {model.legs.map((leg, index) => {
          const expanded = expandedLegs.has(index);
          const allDepartures = allDeparturesLegs.has(index);
          const stops = leg.stops && leg.stops.length > 0 && leg.stopCount ? leg.stops : null;
          const quick = leg.quickDepartures ?? leg.departures?.slice(0, 3) ?? [];
          const selectedDeparture = leg.departures?.findIndex((departure) => departure.selected) ?? -1;
          const selectDeparture = onSelectDeparture ? (key: string) => onSelectDeparture(index, key) : undefined;
          const duration = formatDurationMinutes(leg.durationMinutes);
          const transferWait = leg.waitBeforeMinutes !== undefined ? formatDurationMinutes(leg.waitBeforeMinutes) : null;
          return (
            <View key={`${leg.shortName}-${index}`} style={styles.stepGroup}>
              {leg.walkBefore ? (
                <WalkCard testID={`${testPrefix}-walk-${index}`} waitMinutes={index > 0 ? leg.waitBeforeMinutes : undefined} walk={leg.walkBefore} />
              ) : index > 0 && transferWait ? (
                // A transfer at the same stop: no walk, just the wait.
                <View accessibilityLabel={`Transfer, wait ${transferWait.accessibility}`} accessible={true} style={styles.transferRow} testID={`${testPrefix}-transfer-${index}`}>
                  <Icon color={colors.primary} name="swap" size={16} />
                  <Text style={styles.walkText}><Text style={styles.walkStrong}>Transfer</Text>{` · wait ${transferWait.visible}`}</Text>
                </View>
              ) : null}
              <View style={[styles.stepCard, { borderColor: shade(tint(leg.color), colors.surface, 0.3), backgroundColor: shade(tint(leg.color), colors.surface, isDark ? 0.14 : 0.07) }]} testID={`${testPrefix}-${tone === 'recent' ? 'leg' : 'step'}-${index}`}>
                {/* Grouped for screen readers; the departures and stop list below stay separately operable. */}
                <View accessibilityLabel={`${leg.routeName}, ${leg.direction}, ${duration.accessibility}, ${leg.startTime} to ${leg.endTime}`} accessible={true} style={styles.stepHeader}>
                  <RouteBadge agency={leg.agency} alert={!!leg.alerts?.length} color={tint(leg.color)} mode={leg.mode} shortName={leg.shortName} size="large" textColor={leg.textColor} />
                  <View style={styles.routeCopy}>
                    <Text style={styles.stepAction}>{leg.routeName}</Text>
                    <Text numberOfLines={2} style={styles.headerDirection}>{leg.headsign ? `Toward ${leg.headsign}` : leg.direction}</Text>
                  </View>
                  <Text style={styles.segmentDuration}>{duration.visible}</Text>
                </View>
                {/* "Live · on time" is left to the green signals; late, cancelled and connection warnings show. */}
                {leg.notes && leg.notes.some((note) => note.tone !== 'live') ? (
                  <View style={styles.legNotes} testID={`${testPrefix}-notes-${index}`}>
                    {leg.notes.filter((note) => note.tone !== 'live').map((note) => <TripNotePill key={note.kind} note={note} testID={`${testPrefix}-note-${index}-${note.kind}`} />)}
                  </View>
                ) : null}
                {leg.alerts && leg.alerts.length > 0 ? (
                  <LegAlerts alerts={leg.alerts} expanded={openAlertLegs.has(index)} onToggle={() => toggleLegAlerts(index)} testID={`${testPrefix}-alerts-${index}`} />
                ) : null}

                {leg.departures && leg.departures.length > 1 ? (
                  <View style={styles.departureBox} testID={`${testPrefix}-departures-${index}`}>
                    <View style={styles.departureChips}>
                      {quick.map((departure) => (
                        <DepartureChip
                          key={departure.key}
                          color={tint(leg.color)}
                          departure={departure}
                          live={!!leg.live && departure.selected}
                          onPress={selectDeparture ? () => selectDeparture(departure.key) : undefined}
                          testID={`${testPrefix}-departure-${index}-${departure.key}`}
                          textColor={leg.textColor}
                        />
                      ))}
                      {/* Only when the list has times the chips don't. */}
                      {leg.departures.length > quick.length ? <PressableScale
                        accessibilityHint="Shows every departure"
                        accessibilityLabel="More departures"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: allDepartures }}
                        onPress={() => toggleAllDepartures(index)}
                        style={styles.departureChip}
                        testID={`${testPrefix}-all-departures-${index}`}
                      >
                        <Text style={styles.allDeparturesText}>More</Text>
                      </PressableScale> : null}
                    </View>
                    {/* Every departure, in a popup from the bottom; picking one closes it. */}
                    <Modal animationType="slide" onRequestClose={() => toggleAllDepartures(index)} transparent={true} visible={allDepartures}>
                      <Pressable accessibilityLabel="Close departures" onPress={() => toggleAllDepartures(index)} style={styles.sheetBackdrop} testID={`${testPrefix}-departure-backdrop-${index}`} />
                      <View style={styles.linesSheet}>
                        <View style={styles.linesSheetHeader}>
                          {/* The line's badge, then the title: "51 departures" read like a count. */}
                          <RouteBadge agency={leg.agency} color={tint(leg.color)} mode={leg.mode} shortName={leg.shortName} textColor={leg.textColor} />
                          <Text accessibilityLabel={`Departures for ${leg.shortName}`} accessibilityRole="header" numberOfLines={2} style={styles.linesSheetTitle}>Departures</Text>
                          <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={() => toggleAllDepartures(index)} testID={`${testPrefix}-departure-close-${index}`}><Icon name="close" size={26} /></PressableScale>
                        </View>
                      <ScrollView style={styles.departureList} testID={`${testPrefix}-departure-list-${index}`}>
                        {leg.departures.map((departure, departureIndex) => (
                          <PressableScale
                            key={departure.key}
                            accessibilityLabel={`Depart ${departure.time}, arrive ${departure.arriveTime}${departure.reachable ? '' : ', too soon to make'}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: departure.selected, disabled: !departure.reachable }}
                            disabled={!departure.reachable || !selectDeparture}
                            onPress={() => {
                              selectDeparture?.(departure.key);
                              toggleAllDepartures(index);
                            }}
                            // Times before the one taken sit faded above it, like those too soon to make.
                            style={[styles.departureListRow, (!departure.reachable || departureIndex < selectedDeparture) && styles.departureUnreachable]}
                            testID={`${testPrefix}-departure-row-${index}-${departure.key}`}
                          >
                            <View style={[styles.departureRadio, departure.selected && { borderColor: tint(leg.color), backgroundColor: tint(leg.color) }]} />
                            <View style={styles.departureListTimeRow}>
                              <Text style={[styles.departureListTime, departure.selected && styles.walkStrong]}>{departure.time}</Text>
                              {leg.live && departure.selected ? <LiveSignal color={colors.green} style={styles.departureListSignal} /> : null}
                            </View>
                            <Icon color={colors.mutedInk} name="forward" size={14} />
                            <Text style={styles.departureListArrive}>{`arrive ${departure.arriveTime}`}</Text>
                          </PressableScale>
                        ))}
                      </ScrollView>
                      </View>
                    </Modal>
                  </View>
                ) : null}

                <View style={styles.segmentTimeline}>
                  <View style={styles.timelineRow}>
                    <Rail color={tint(leg.color)} dot="terminal" from={false} />
                    <View style={styles.stopRow}><Text style={styles.stopName}>{leg.startName}</Text><View style={styles.stopTimeLive}><Text style={styles.stopTime}>{leg.startTime}</Text>{leg.live ? <LiveSignal color={colors.green} style={styles.stopTimeSignal} /> : null}</View></View>
                  </View>
                  {stops ? (
                    <>
                      <View style={styles.timelineRow}>
                        <Rail color={tint(leg.color)} />
                        <PressableScale
                          accessibilityHint={expanded ? 'Hides the stops in between' : 'Lists every stop in between with its time'}
                          accessibilityLabel={`${leg.stopCount} stops`}
                          accessibilityRole="button"
                          accessibilityState={{ expanded }}
                          onPress={() => toggleLeg(index)}
                          style={styles.stopsToggle}
                          testID={`${testPrefix}-stops-toggle-${index}`}
                        >
                          <Text style={[styles.stopsToggleText, { color: tint(leg.color) }]}>{`${leg.stopCount} ${leg.stopCount === 1 ? 'stop' : 'stops'}`}</Text>
                          <Icon color={colors.mutedInk} name={expanded ? 'collapse' : 'expand'} size={16} />
                        </PressableScale>
                      </View>
                      {expanded ? (
                        <View testID={`${testPrefix}-stops-${index}`}>
                          {stops.map((stop, stopIndex) => (
                            <PressableScale
                              key={`${stop.name}-${stopIndex}`}
                              accessibilityHint="Shows this stop on the map"
                              accessibilityLabel={`${stop.name}, ${stop.time}`}
                              accessibilityRole="button"
                              disabled={!onFocusStop}
                              onPress={() => onFocusStop?.(stop)}
                              style={styles.timelineRow}
                              testID={`${testPrefix}-stop-${index}-${stopIndex}`}
                            >
                              <Rail color={tint(leg.color)} dot="via" />
                              <View style={styles.viaRow}>
                                <Text numberOfLines={1} style={styles.viaName}>{stop.name}</Text>
                                <Text style={styles.viaTime}>{stop.time}</Text>
                              </View>
                            </PressableScale>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.timelineRow}>
                      <Rail color={tint(leg.color)} />
                      <Text style={styles.direction}>{leg.stopCount ? `${leg.stopCount} ${leg.stopCount === 1 ? 'stop' : 'stops'}` : ''}</Text>
                    </View>
                  )}
                  <View style={styles.timelineRow}>
                    <Rail color={tint(leg.color)} dot="terminal" to={false} />
                    <View style={styles.stopRow}><Text style={styles.stopName}>{leg.endName}</Text><Text style={styles.stopTime}>{leg.endTime}</Text></View>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
        {model.walkAfter ? <WalkCard testID={`${testPrefix}-walk-end`} walk={model.walkAfter} /> : null}
        <PressableScale
          accessibilityHint={hasDestinationLines ? 'Shows every line at this stop' : undefined}
          accessibilityLabel={`Arrive at ${model.destination}${model.destinationAddress ? `, ${model.destinationAddress}` : ''}, ${model.arriveTime}`}
          accessibilityRole={hasDestinationLines ? 'button' : undefined}
          disabled={!hasDestinationLines}
          onPress={() => setDestinationLinesOpen(true)}
          style={styles.walkCard}
          testID={`${testPrefix}-arrival`}
        >
          <View style={[styles.walkIcon, styles.arrivalIcon]}><Icon color={colors.onPrimary} name="place" size={20} /></View>
          <View style={styles.routeCopy}>
            <Text numberOfLines={2} style={styles.stepAction}>{model.destination}</Text>
            {model.destinationLines && model.destinationLines.length > 0 ? (
              <View style={styles.arrivalLines} testID={`${testPrefix}-arrival-lines`}>
                {model.destinationLines.slice(0, MAX_ARRIVAL_BADGES).map((line) => <RouteBadge key={line.shortName} agency={line.agency} color={tint(line.color)} mode={line.mode} shortName={line.shortName} size="small" />)}
                {model.destinationLines.length > MAX_ARRIVAL_BADGES ? <Text style={styles.arrivalLabel}>{`+${model.destinationLines.length - MAX_ARRIVAL_BADGES}`}</Text> : null}
              </View>
            ) : model.destinationAddress ? <Text numberOfLines={2} style={styles.headerDirection}>{model.destinationAddress}</Text> : null}
          </View>
          <View style={styles.arrivalTime}>
            <Text style={styles.arrivalLabel}>Arrive</Text>
            <Text style={styles.segmentDuration}>{model.arriveTime}</Text>
          </View>
        </PressableScale>
        <DestinationLinesSheet lines={destinationLinesOpen ? model.destinationLines ?? [] : null} onClose={() => setDestinationLinesOpen(false)} stopName={model.destination} />
      </View>
    </DetailMapPage>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  headerDirection: { marginTop: 2, color: colors.ink, ...typography.metadata, fontSize: 12 },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 22, alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', left: 9, width: 4 },
  railTop: { top: 0, bottom: '50%' },
  railBottom: { top: '50%', bottom: 0 },
  walkCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  walkIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.surfaceMuted },
  walkTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  walkMeta: { marginTop: 2, color: colors.mutedInk, ...typography.metadata },
  walkChip: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  walkChipText: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 12 },
  departureBox: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  departureChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  departureChipLive: { flexDirection: 'row', alignItems: 'center' },
  departureChipSignal: { marginLeft: 2, marginTop: -6, transform: [{ scale: 0.8 }] },
  departureListTimeRow: { minWidth: 72, flexDirection: 'row', alignItems: 'flex-start' },
  departureListSignal: { marginLeft: 1, transform: [{ scale: 0.8 }] },
  legAlerts: { marginHorizontal: 14, marginTop: 10, borderRadius: 14, backgroundColor: colors.highlightSoft, overflow: 'hidden' },
  legAlertsToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  legAlertsDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.alertYellow },
  legAlertsMark: { color: colors.onAlertYellow, fontFamily: fontFamilies.extraBold, fontSize: 12, includeFontPadding: false },
  legAlertsSummary: { minWidth: 0, flex: 1, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  legAlertsCount: { color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
  legAlertsList: { gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  legAlert: { gap: 4 },
  legAlertHeader: { color: colors.ink, ...typography.bodyStrong, fontSize: 13 },
  legAlertDescription: { color: colors.mutedInk, ...typography.metadata, fontSize: 12, lineHeight: 17 },
  arrivalIcon: { backgroundColor: colors.primary },
  arrivalTime: { alignItems: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  linesSheet: { width: '100%', maxWidth: 540, maxHeight: '70%', alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, backgroundColor: colors.surface },
  linesSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linesSheetTitle: { flex: 1, color: colors.ink, ...typography.screenHeading, fontSize: 21 },
  linesSheetContent: { gap: 14, paddingTop: 6 },
  linesSheetHeading: { color: colors.mutedInk, ...typography.label },
  linesSheetBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  leaveCard: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  leaveCardUrgent: { borderColor: colors.alertYellow, backgroundColor: colors.highlightSoft },
  leaveIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.blueSoft },
  leaveIconUrgent: { backgroundColor: colors.alertYellow },
  leaveTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leaveTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 14, lineHeight: 19 },
  leaveSignal: { marginLeft: 2 },
  arrivalLines: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 4 },
  arrivalLabel: { color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
  departureChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  departureChipText: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 13, fontVariant: ['tabular-nums'] },
  departureUnreachable: { opacity: 0.45 },
  allDeparturesText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  departureList: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  departureListRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  departureRadio: { width: 14, height: 14, borderWidth: 2, borderColor: colors.border, borderRadius: 7 },
  departureListTime: { color: colors.ink, ...typography.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  departureListArrive: { color: colors.mutedInk, ...typography.metadata, fontVariant: ['tabular-nums'] },
  stopsToggle: { alignSelf: 'center', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 10 },
  stopsToggleText: { fontFamily: fontFamilies.extraBold, fontSize: 13 },
  viaRow: { minWidth: 0, flex: 1, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 },
  viaDot: { zIndex: 1, width: 10, height: 10, borderRadius: 5 },
  viaName: { flex: 1, color: colors.ink, ...typography.body, fontSize: 14 },
  viaTime: { color: colors.mutedInk, ...typography.metadata, fontVariant: ['tabular-nums'] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 14 }, mapActions: { gap: 10 },
  goButton: { minWidth: 104, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, borderWidth: 3, borderColor: colors.blueSoft, borderRadius: 30, backgroundColor: colors.primary, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 9 }, endTripAction: { borderColor: '#992D38', backgroundColor: colors.red }, goButtonPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] }, goButtonText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  content: { padding: 16, paddingTop: 20, paddingBottom: 28, backgroundColor: colors.surfaceMuted }, summaryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, summaryHeaderLargeText: { flexDirection: 'column', alignItems: 'stretch' }, modeStrip: { minWidth: 0, flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6, paddingTop: 4 }, modeStripLargeText: { flexGrow: 0 }, modeItem: { flexDirection: 'row', alignItems: 'center' }, modeArrow: { marginHorizontal: 3 }, primaryMetrics: { minWidth: 0, flexShrink: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 14 }, primaryMetricsLargeText: { alignSelf: 'stretch', flexShrink: 1, justifyContent: 'space-between' }, fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 }, metricValue: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 10 }, minutes: { flexShrink: 1, fontSize: 25, lineHeight: 27, textAlign: 'right' }, minutesLive: { flexShrink: 1, flexDirection: 'row', alignItems: 'flex-start' }, minutesSignal: { marginLeft: 2, marginTop: 1 },
  timeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 9, elevation: 2 }, timeLabel: { color: colors.primary, ...typography.label, fontSize: 12 }, timeValue: { marginTop: 2, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20, lineHeight: 25 }, arriveTime: { alignItems: 'flex-end' },
  tripContext: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 }, tripContextCopy: { minWidth: 0, flex: 1 }, contextLabel: { color: colors.primary, ...typography.label, fontSize: 9 }, destination: { marginTop: 2, color: colors.ink, ...typography.sectionHeading, fontSize: 19 }, origin: { marginTop: 2, color: colors.mutedInk, ...typography.metadata }, detailNote: { marginTop: 2, color: colors.primary, ...typography.metadata }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.control, backgroundColor: colors.greenSoft }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, statusText: { color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 10 }, recentStatus: { backgroundColor: colors.blueSoft }, recentStatusDot: { backgroundColor: colors.primary }, recentStatusText: { color: colors.primary }, transferLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }, transferCount: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, transferText: { marginLeft: 4, color: colors.mutedInk, ...typography.metadata },
  alertButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.background }, alertIcon: { marginRight: 8 }, alertText: { flex: 1, color: colors.ink, ...typography.bodyStrong }, alertStatus: { color: colors.success, ...typography.metadata }, chevron: { marginLeft: 8, color: colors.mutedInk, fontFamily: fontFamilies.extraBold }, alertBody: { paddingHorizontal: 14, paddingTop: 8, color: colors.mutedInk, ...typography.metadata },
  steps: { gap: 14, marginTop: 14 }, stepGroup: { gap: 10 }, transferRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.control }, walkText: { flex: 1, color: colors.mutedInk, ...typography.metadata }, walkStrong: { color: colors.ink, fontFamily: fontFamilies.extraBold }, stepCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }, stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, legNotes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 10 }, routeCopy: { minWidth: 0, flex: 1 }, stepAction: { color: colors.ink, ...typography.routeName, fontSize: 16, lineHeight: 20 }, segmentDuration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, segmentTimeline: { paddingVertical: 8, paddingHorizontal: 15 }, segmentDot: { zIndex: 1, width: 17, height: 17, borderWidth: 5, borderRadius: 9, backgroundColor: colors.white }, stopRow: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginLeft: 10, paddingVertical: 8 }, stopName: { minWidth: 0, flex: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 14 }, stopTime: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 14 }, stopTimeLive: { flexDirection: 'row', alignItems: 'flex-start' }, stopTimeSignal: { marginLeft: 2, marginTop: -2 }, direction: { alignSelf: 'center', marginLeft: 10, paddingVertical: 10, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
});
