import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { routes } from '../data/transit';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import { useLayoutEase } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { ConfirmDialog } from './ConfirmDialog';
import { DetailMapPage } from './DetailMapPage';
import { Icon } from './Icon';
import { MapBackdrop } from './MapBackdrop';
import { RouteBadge, type TransitMode } from './RouteBadge';
import { DestinationPin, orientLegs, routeFocus, RouteLines, type MapLeg } from './RouteMapOverlay';
import { PressableScale } from './PressableScale';

const MAP_HEIGHT = 360;

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

function MapControl({ children, label, onPress, selected, testID }: { children: ReactNode; label: string; onPress: () => void; selected?: boolean; testID: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <PressableScale accessibilityLabel={label} accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress} style={[styles.roundButton, selected && styles.selectedControl]} testID={testID}>
      {children}
    </PressableScale>
  );
}

/** Walking gets a card of its own; a transfer between legs adds the wait for the next one. */
function WalkCard({ testID, waitMinutes, walk }: { testID: string; waitMinutes?: number; walk: TripDetailWalk }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const wait = waitMinutes !== undefined ? `, then wait ${waitMinutes} minutes` : '';
  return (
    <View accessibilityLabel={`Walk ${walk.minutes} minutes, ${walk.distance}, to ${walk.toName}${wait}`} accessible={true} style={styles.walkCard} testID={testID}>
      <View style={styles.walkIcon}><Icon color={colors.ink} filled={true} name="travel" size={20} /></View>
      <View style={styles.routeCopy}>
        <Text style={styles.walkTitle}>{`Walk to ${walk.toName}`}</Text>
        <Text style={styles.walkMeta}>{walk.distance}{waitMinutes !== undefined ? ` · then wait ${waitMinutes} min` : ''}</Text>
      </View>
      <Text style={styles.segmentDuration}>{walk.minutes} min</Text>
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

function DepartureChip({ color, departure, onPress, testID, textColor }: { color: string; departure: TripDetailDeparture; onPress?: () => void; testID: string; textColor?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <PressableScale
      accessibilityLabel={`Depart ${departure.time}, arrive ${departure.arriveTime}`}
      accessibilityRole="button"
      accessibilityState={{ selected: departure.selected, disabled: !departure.reachable }}
      disabled={!departure.reachable || !onPress}
      onPress={onPress}
      style={[styles.departureChip, departure.selected && { borderColor: color, backgroundColor: color }, !departure.reachable && styles.departureUnreachable]}
      testID={testID}
    >
      <Text style={[styles.departureChipText, departure.selected && { color: textColor ?? '#FFFFFF' }]}>{departure.time}</Text>
    </PressableScale>
  );
}

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

export function SharedTripDetailView({ actionLabel, backLabel, interactiveMap = false, isFavorite, locationSelected, map: tripMap, model, onAction, onBack, onCenterOnLocation, onFocusStop, onSelectDeparture, onToggleFavorite, rootTestID, showServiceAlerts = true, testPrefix, tone = 'planned' }: SharedTripDetailViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  // Legs whose stops in between are shown, by index.
  const [expandedLegs, setExpandedLegs] = useState<ReadonlySet<number>>(new Set());
  // Legs whose full departure list is open, by index.
  const [allDeparturesLegs, setAllDeparturesLegs] = useState<ReadonlySet<number>>(new Set());
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

  const map = tripMap ?? (
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
        <MapControl label={isFavorite ? 'Remove destination from saved' : 'Save destination'} onPress={onToggleFavorite} selected={isFavorite} testID={`${testPrefix}-favorite`}><Icon color={isFavorite ? colors.warning : colors.primary} filled={isFavorite} name="favorite" size={24} /></MapControl>
        <MapControl label="Center trip map on current location" onPress={() => {
          setIsLocationCentered(true);
          onCenterOnLocation?.();
        }} selected={locationSelected ?? isLocationCentered} testID={`${testPrefix}-location`}><Icon filled={locationSelected ?? isLocationCentered} name="locate" /></MapControl>
      </View>
    </View>
  );

  const action = (
    <PressableScale accessibilityLabel={actionLabel} accessibilityRole="button" onPress={isEndAction ? () => setConfirmingEnd(true) : onAction} style={[styles.goButton, isEndAction && styles.endTripAction]} testID={isEndAction ? `${testPrefix}-end` : `${testPrefix}-go`}>
      <Icon color={colors.onPrimary} filled={true} name={isEndAction ? 'stop' : 'go'} size={20} />
      <Text style={styles.goButtonText}>{isEndAction ? 'END' : 'GO'}</Text>
    </PressableScale>
  );

  return (
    <DetailMapPage
      action={action}
      interactiveMap={interactiveMap}
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
      <View style={styles.summaryHeader}>
        <View style={styles.modeStrip}>
          {/* Every walk with its minutes, transfers' short ones too, so the total walking is clear.
              A long trip wraps its badges onto more rows; the minutes and fare keep their place. */}
          {summaryParts(model).map((part, index, parts) => (
            <View key={`${part.kind}-${index}-summary`} style={styles.modeItem}>
              {part.kind === 'walk' ? (
                <View accessibilityLabel={`Walk ${part.minutes} minutes`} accessible={true} style={styles.walkChip} testID={`${testPrefix}-summary-walk-${index}`}>
                  <Icon color={colors.mutedInk} filled={true} name="travel" size={16} />
                  <Text style={styles.walkChipText}>{part.minutes}</Text>
                </View>
              ) : <RouteBadge agency={part.leg.agency} color={part.leg.color} mode={part.leg.mode} shortName={part.leg.shortName} size="small" textColor={part.leg.textColor} />}
              {index < parts.length - 1 ? <Icon color={colors.mutedInk} name="forward" size={16} style={styles.modeArrow} /> : null}
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

      {showServiceAlerts ? (
        <PressableScale accessibilityLabel="Service alerts" accessibilityRole="button" accessibilityState={{ expanded: alertsOpen }} onPress={() => {
          ease();
          setAlertsOpen((value) => !value);
        }} style={styles.alertButton} testID={`${testPrefix}-service-alerts`}>
          <Icon color={colors.success} filled={true} name="ok" size={18} style={styles.alertIcon} /><Text style={styles.alertText}>Service alerts</Text><Text style={styles.alertStatus}>No delays</Text><Icon color={colors.mutedInk} name={alertsOpen ? 'collapse' : 'expand'} size={18} style={styles.chevron} />
        </PressableScale>
      ) : null}
      {showServiceAlerts && alertsOpen ? <Text style={styles.alertBody}>No active service advisories affect this trip.</Text> : null}

      <View style={styles.steps}>
        {model.legs.map((leg, index) => {
          const expanded = expandedLegs.has(index);
          const allDepartures = allDeparturesLegs.has(index);
          const stops = leg.stops && leg.stops.length > 0 && leg.stopCount ? leg.stops : null;
          const selectDeparture = onSelectDeparture ? (key: string) => onSelectDeparture(index, key) : undefined;
          return (
            <View key={`${leg.shortName}-${index}`} style={styles.stepGroup}>
              {leg.walkBefore ? (
                <WalkCard testID={`${testPrefix}-walk-${index}`} waitMinutes={index > 0 ? leg.waitBeforeMinutes : undefined} walk={leg.walkBefore} />
              ) : index > 0 && leg.waitBeforeMinutes !== undefined ? (
                // A transfer at the same stop: no walk, just the wait.
                <View accessibilityLabel={`Transfer, wait ${leg.waitBeforeMinutes} minutes`} accessible={true} style={styles.transferRow} testID={`${testPrefix}-transfer-${index}`}>
                  <Icon color={colors.primary} name="swap" size={16} />
                  <Text style={styles.walkText}><Text style={styles.walkStrong}>Transfer</Text>{` · wait ${leg.waitBeforeMinutes} min`}</Text>
                </View>
              ) : null}
              <View style={styles.stepCard} testID={`${testPrefix}-${tone === 'recent' ? 'leg' : 'step'}-${index}`}>
                {/* Grouped for screen readers; the departures and stop list below stay separately operable. */}
                <View accessibilityLabel={`${leg.routeName}, ${leg.direction}, ${leg.startTime} to ${leg.endTime}`} accessible={true} style={styles.stepHeader}>
                  <RouteBadge agency={leg.agency} color={leg.color} mode={leg.mode} shortName={leg.shortName} size="large" textColor={leg.textColor} withModeIcon={true} />
                  <View style={styles.routeCopy}>
                    <Text style={styles.stepAction}>{leg.routeName}</Text>
                    <Text numberOfLines={2} style={styles.headerDirection}>{leg.headsign ? `Toward ${leg.headsign}` : leg.direction}</Text>
                  </View>
                  <Text style={styles.segmentDuration}>{leg.durationMinutes} min</Text>
                </View>

                {leg.departures && leg.departures.length > 1 ? (
                  <View style={styles.departureBox} testID={`${testPrefix}-departures-${index}`}>
                    <View style={styles.departureChips}>
                      {(leg.quickDepartures ?? leg.departures.slice(0, 3)).map((departure) => (
                        <DepartureChip
                          key={departure.key}
                          color={leg.color}
                          departure={departure}
                          onPress={selectDeparture ? () => selectDeparture(departure.key) : undefined}
                          testID={`${testPrefix}-departure-${index}-${departure.key}`}
                          textColor={leg.textColor}
                        />
                      ))}
                      <PressableScale
                        accessibilityLabel="All departures"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: allDepartures }}
                        onPress={() => toggleAllDepartures(index)}
                        style={styles.allDepartures}
                        testID={`${testPrefix}-all-departures-${index}`}
                      >
                        <Text style={styles.allDeparturesText}>All departures</Text>
                        <Icon color={colors.primary} name={allDepartures ? 'collapse' : 'expand'} size={14} />
                      </PressableScale>
                    </View>
                    {allDepartures ? (
                      <View style={styles.departureList} testID={`${testPrefix}-departure-list-${index}`}>
                        {leg.departures.map((departure) => (
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
                            style={[styles.departureListRow, !departure.reachable && styles.departureUnreachable]}
                            testID={`${testPrefix}-departure-row-${index}-${departure.key}`}
                          >
                            <View style={[styles.departureRadio, departure.selected && { borderColor: leg.color, backgroundColor: leg.color }]} />
                            <Text style={[styles.departureListTime, departure.selected && styles.walkStrong]}>{departure.time}</Text>
                            <Icon color={colors.mutedInk} name="forward" size={14} />
                            <Text style={styles.departureListArrive}>{`arrive ${departure.arriveTime}`}</Text>
                          </PressableScale>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.segmentTimeline}>
                  <View style={styles.timelineRow}>
                    <Rail color={leg.color} dot="terminal" from={false} />
                    <View style={styles.stopRow}><Text style={styles.stopName}>{leg.startName}</Text><Text style={styles.stopTime}>{leg.startTime}</Text></View>
                  </View>
                  {stops ? (
                    <>
                      <View style={styles.timelineRow}>
                        <Rail color={leg.color} />
                        <PressableScale
                          accessibilityHint={expanded ? 'Hides the stops in between' : 'Lists every stop in between with its time'}
                          accessibilityLabel={`${leg.stopCount} stops`}
                          accessibilityRole="button"
                          accessibilityState={{ expanded }}
                          onPress={() => toggleLeg(index)}
                          style={styles.stopsToggle}
                          testID={`${testPrefix}-stops-toggle-${index}`}
                        >
                          <Text style={[styles.stopsToggleText, { color: leg.color }]}>{`${leg.stopCount} ${leg.stopCount === 1 ? 'stop' : 'stops'}`}</Text>
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
                              <Rail color={leg.color} dot="via" />
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
                      <Rail color={leg.color} />
                      <Text style={styles.direction}>{leg.stopCount ? `${leg.stopCount} ${leg.stopCount === 1 ? 'stop' : 'stops'}` : ''}</Text>
                    </View>
                  )}
                  <View style={styles.timelineRow}>
                    <Rail color={leg.color} dot="terminal" to={false} />
                    <View style={styles.stopRow}><Text style={styles.stopName}>{leg.endName}</Text><Text style={styles.stopTime}>{leg.endTime}</Text></View>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
        {model.walkAfter ? <WalkCard testID={`${testPrefix}-walk-end`} walk={model.walkAfter} /> : null}
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
  departureChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.surface },
  departureChipText: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 13, fontVariant: ['tabular-nums'] },
  departureUnreachable: { opacity: 0.45 },
  allDepartures: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  allDeparturesText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  departureList: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  departureListRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  departureRadio: { width: 14, height: 14, borderWidth: 2, borderColor: colors.border, borderRadius: 7 },
  departureListTime: { minWidth: 72, color: colors.ink, ...typography.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  departureListArrive: { color: colors.mutedInk, ...typography.metadata, fontVariant: ['tabular-nums'] },
  stopsToggle: { alignSelf: 'center', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 10 },
  stopsToggleText: { fontFamily: fontFamilies.extraBold, fontSize: 13 },
  viaRow: { minWidth: 0, flex: 1, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 },
  viaDot: { zIndex: 1, width: 10, height: 10, borderRadius: 5 },
  viaName: { flex: 1, color: colors.ink, ...typography.body, fontSize: 14 },
  viaTime: { color: colors.mutedInk, ...typography.metadata, fontVariant: ['tabular-nums'] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 14 }, mapActions: { flexDirection: 'row', gap: 10 }, roundButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 5 }, selectedControl: { backgroundColor: colors.blueSoft },
  goButton: { minWidth: 104, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, borderWidth: 3, borderColor: colors.blueSoft, borderRadius: 30, backgroundColor: colors.primary, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 9 }, endTripAction: { borderColor: '#992D38', backgroundColor: colors.red }, goButtonPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] }, goButtonText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  content: { padding: 16, paddingTop: 20, paddingBottom: 28, backgroundColor: colors.surfaceMuted }, summaryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, modeStrip: { minWidth: 0, flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6, paddingTop: 4 }, modeItem: { flexDirection: 'row', alignItems: 'center' }, modeArrow: { marginHorizontal: 3 }, primaryMetrics: { flexShrink: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 14 }, fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 }, metricValue: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 10 }, minutes: { fontSize: 25, lineHeight: 27 },
  timeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 9, elevation: 2 }, timeLabel: { color: colors.primary, ...typography.label, fontSize: 12 }, timeValue: { marginTop: 2, color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 20, lineHeight: 25 }, arriveTime: { alignItems: 'flex-end' },
  tripContext: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 }, tripContextCopy: { minWidth: 0, flex: 1 }, contextLabel: { color: colors.primary, ...typography.label, fontSize: 9 }, destination: { marginTop: 2, color: colors.ink, ...typography.sectionHeading, fontSize: 19 }, origin: { marginTop: 2, color: colors.mutedInk, ...typography.metadata }, detailNote: { marginTop: 2, color: colors.primary, ...typography.metadata }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.greenSoft }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, statusText: { color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 10 }, recentStatus: { backgroundColor: colors.blueSoft }, recentStatusDot: { backgroundColor: colors.primary }, recentStatusText: { color: colors.primary }, transferLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }, transferCount: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, transferText: { marginLeft: 4, color: colors.mutedInk, ...typography.metadata },
  alertButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.background }, alertIcon: { marginRight: 8 }, alertText: { flex: 1, color: colors.ink, ...typography.bodyStrong }, alertStatus: { color: colors.success, ...typography.metadata }, chevron: { marginLeft: 8, color: colors.mutedInk, fontFamily: fontFamilies.extraBold }, alertBody: { paddingHorizontal: 14, paddingTop: 8, color: colors.mutedInk, ...typography.metadata },
  steps: { gap: 14, marginTop: 14 }, stepGroup: { gap: 10 }, transferRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 14 }, walkText: { flex: 1, color: colors.mutedInk, ...typography.metadata }, walkStrong: { color: colors.ink, fontFamily: fontFamilies.extraBold }, stepCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }, stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, routeCopy: { minWidth: 0, flex: 1 }, stepAction: { color: colors.ink, ...typography.routeName, fontSize: 16, lineHeight: 20 }, segmentDuration: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 }, segmentTimeline: { paddingVertical: 8, paddingHorizontal: 15 }, segmentDot: { zIndex: 1, width: 17, height: 17, borderWidth: 5, borderRadius: 9, backgroundColor: colors.white }, stopRow: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginLeft: 10, paddingVertical: 8 }, stopName: { minWidth: 0, flex: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 14 }, stopTime: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 14 }, direction: { alignSelf: 'center', marginLeft: 10, paddingVertical: 10, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
});
