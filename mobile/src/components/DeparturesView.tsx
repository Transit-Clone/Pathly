import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { directionDestination, formatClockTime, type LiveSource, type RouteDetail, type RoutePrediction } from '../data/transit';
import { fetchStopDepartures } from '../data/transitLive';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { LiveSignal } from './LiveSignal';
import { PressableScale } from './PressableScale';
import { RouteBadge } from './RouteBadge';
import { predictionsForDirection } from './RouteDetailView';

type DeparturesViewProps = {
  /** `directions` index to list departures for. */
  directionIndex: number;
  onBack: () => void;
  /** The route with live data applied, so each direction carries the rider's nearest stop. */
  route: RouteDetail;
};

type DeparturesState =
  | { status: 'loading' }
  | { status: 'loaded'; departures: readonly RoutePrediction[]; fetchedAt: Date }
  | { status: 'error' };

/** "12 min", or "2 h 5 min" once an hour or more away. */
function waitLabel(minutes: number): string {
  const wait = Math.max(0, Math.round(minutes));
  if (wait < 60) return `${wait} min`;
  const hours = Math.floor(wait / 60);
  return wait % 60 === 0 ? `${hours} h` : `${hours} h ${wait % 60} min`;
}

/** The live source with each direction's stop set to the rider's nearest stop, when known. */
function sourceForNearestStops(route: RouteDetail, source: LiveSource): LiveSource {
  const direction0Index = source.direction1Index === 0 ? 1 : 0;
  return {
    ...source,
    direction1StopId: route.directions[source.direction1Index]?.stopId ?? source.direction1StopId,
    direction0StopId: route.directions[direction0Index]?.stopId ?? source.direction0StopId,
  };
}

/** Every remaining departure from the rider's stop in one direction — route detail's "More departures". */
export function DeparturesView({ directionIndex, onBack, route }: DeparturesViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const direction = route.directions[directionIndex] ?? route.directions[0];
  const source = route.liveSource ? sourceForNearestStops(route, route.liveSource) : null;
  const directionId: 0 | 1 = route.liveSource && directionIndex === route.liveSource.direction1Index ? 1 : 0;
  const sourceKey = source ? `${source.agencyId}:${source.routeId}:${source.direction1StopId}:${source.direction0StopId}:${directionId}` : null;

  // Illustrative routes (no live source) list the same departures their tiles show.
  const [state, setState] = useState<DeparturesState>(() => (source
    ? { status: 'loading' }
    : { status: 'loaded', departures: predictionsForDirection(route, directionIndex), fetchedAt: new Date() }));
  useEffect(() => {
    if (!source) return undefined;
    let cancelled = false;
    fetchStopDepartures(source, directionId)
      .then((departures) => {
        if (!cancelled) setState({ status: 'loaded', departures, fetchedAt: new Date() });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stop ids, not the source object (new every render)
  }, [sourceKey]);

  return (
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="departures-view">
        <ThemedStatusBar />
        <View style={styles.header}>
          <PressableScale accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.backButton} testID="departures-back"><Icon name="back" size={26} /></PressableScale>
          <RouteBadge agency={route.agency} color={route.color} shortName={route.shortName} withModeIcon={true} />
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title} testID="departures-destination">{directionDestination(direction.direction)}</Text>
            <Text numberOfLines={1} style={styles.subtitle} testID="departures-stop">{`From ${direction.stopName}`}</Text>
          </View>
        </View>

        {state.status === 'loading' ? (
          <View style={styles.message} testID="departures-loading">
            <ActivityIndicator color={route.color} />
            <Text style={styles.messageText}>Loading departures…</Text>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.message} testID="departures-unavailable">
            <Text style={styles.messageText}>Departures unavailable right now.</Text>
          </View>
        ) : state.departures.length === 0 ? (
          <View style={styles.message} testID="departures-empty">
            <Text style={styles.messageText}>No more departures today.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} testID="departures-list">
            {state.departures.map((departure, index) => {
              const clockMinutes = state.fetchedAt.getHours() * 60 + state.fetchedAt.getMinutes() + departure.minutes;
              const time = formatClockTime(clockMinutes);
              const wait = waitLabel(departure.minutes);
              return (
                <View
                  key={`${index}-${departure.minutes}`}
                  accessibilityLabel={`${time}, in ${wait}, ${departure.live ? 'live GPS prediction' : 'scheduled time'}`}
                  accessible={true}
                  style={styles.row}
                  testID={`departure-row-${index}`}
                >
                  <Text style={styles.time}>{time}</Text>
                  <View style={styles.rowEnd}>
                    {departure.live ? <LiveSignal color={colors.success} /> : <Text style={styles.scheduledPill}>SCHEDULED</Text>}
                    <Text style={[styles.wait, !departure.live && styles.scheduledWait]}>{wait}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 18, backgroundColor: colors.background },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerCopy: { minWidth: 0, flex: 1 },
  title: { color: colors.ink, ...typography.screenHeading, fontSize: 22 },
  subtitle: { marginTop: 2, color: colors.mutedInk, ...typography.metadata },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  messageText: { color: colors.mutedInk, ...typography.metadata },
  list: { paddingBottom: 34 },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  time: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 18 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wait: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 15 },
  scheduledWait: { color: colors.mutedInk },
  // Same filled pill as the route-detail tiles' Scheduled label.
  scheduledPill: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.mutedInk,
    color: colors.surface,
    ...typography.label,
    fontSize: 8,
  },
});
