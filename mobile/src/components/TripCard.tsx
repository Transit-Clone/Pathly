import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { RouteBadge } from './RouteBadge';
import { PressableScale } from './PressableScale';

export type TripCardLeg = {
  agency: string;
  alightTime: string;
  boardTime: string;
  color: string;
  shortName: string;
};

export type TripCardData = {
  destination: string;
  durationMinutes: number;
  fare: string;
  legs: readonly TripCardLeg[];
  origin: string;
  recency: string;
};

type TripCardProps = {
  accessibilityLabel?: string;
  actionTestID?: string;
  isActive?: boolean;
  onAction?: () => void;
  onOpen: () => void;
  testID: string;
  trip: TripCardData;
};

export function TripCard({ accessibilityLabel, actionTestID, isActive = false, onAction, onOpen, testID, trip }: TripCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const firstLeg = trip.legs[0];
  const lastLeg = trip.legs.at(-1);
  const timeRange = firstLeg && lastLeg ? `${firstLeg.boardTime} – ${lastLeg.alightTime}` : '';

  return (
    <View style={[styles.card, isActive && styles.activeCard]} testID={`${testID}-card`}>
      {isActive ? <View style={styles.activeAccent} testID={`${testID}-active-accent`} /> : null}
      <PressableScale
        accessibilityLabel={accessibilityLabel ?? `View recent trip to ${trip.destination} from ${trip.origin}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.main, onAction && styles.mainWithAction]}
        testID={testID}
      >
        <View style={[styles.topRow, onAction && styles.topRowWithAction]}>
          <View style={styles.badges}>
            {trip.legs.map((leg, index) => (
              <Fragment key={`${leg.shortName}-${index}`}>
                <RouteBadge agency={leg.agency} color={leg.color} shortName={leg.shortName} size="small" />
                {index < trip.legs.length - 1 ? <Icon color={colors.mutedInk} name="forward" size={14} /> : null}
              </Fragment>
            ))}
          </View>
          <View style={[styles.chip, isActive && styles.activeChip]}>
            {isActive ? <View style={styles.liveDot} /> : <Icon color={colors.mutedInk} name="time" size={12} />}
            <Text style={[styles.chipText, isActive && styles.activeChipText]}>{isActive ? 'In progress' : trip.recency}</Text>
          </View>
        </View>

        <Text numberOfLines={1} style={styles.destination}>{trip.destination}</Text>
        <Text numberOfLines={1} style={styles.origin}>From {trip.origin}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.timeRange}>{timeRange}</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.meta}>{`${trip.durationMinutes} min`}</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.fare}>{trip.fare}</Text>
        </View>
      </PressableScale>

      {onAction ? (
        <PressableScale
          accessibilityLabel={isActive ? `End trip to ${trip.destination}` : `Start trip to ${trip.destination}`}
          accessibilityRole="button"
          onPress={onAction}
          style={[styles.action, isActive && styles.endAction]}
          testID={actionTestID}
        >
          <Icon color={colors.onPrimary} filled={true} name={isActive ? 'stop' : 'go'} size={16} />
          <Text style={styles.actionText}>{isActive ? 'End' : 'Go'}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  activeCard: {
    borderColor: colors.success,
    backgroundColor: colors.greenSoft,
  },
  // Drawn as a child rather than a wider left border: toggling border widths on a
  // clipped, rounded view leaves Android with a blank card after the trip ends.
  activeAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, backgroundColor: colors.success },
  main: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  mainWithAction: { paddingRight: 96 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topRowWithAction: { marginRight: -82 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  activeChip: { backgroundColor: colors.surface },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  chipText: { color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  activeChipText: { color: colors.success, fontFamily: fontFamilies.extraBold },
  destination: { marginTop: 9, color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  origin: { marginTop: 1, color: colors.mutedInk, ...typography.metadata },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  timeRange: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 12 },
  separator: { color: colors.mutedInk, fontSize: 12 },
  meta: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 12 },
  fare: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 12 },
  action: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    minWidth: 72,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  endAction: { backgroundColor: colors.red },
  actionText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
});
