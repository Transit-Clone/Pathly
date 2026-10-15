import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type RecentTripCardProps = {
  destination: string;
  endedAt: number;
  lines: readonly string[];
  onOpen: () => void;
  origin: string;
  outcome: 'arrived' | 'ended-early';
  testID: string;
};

const completedTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A provider-light completed trip; opening it always requests a fresh route. */
export function RecentTripCard({ destination, endedAt, lines, onOpen, origin, outcome, testID }: RecentTripCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const status = outcome === 'arrived' ? 'Arrived' : 'Ended early';
  return (
    <PressableScale
      accessibilityHint="Plans this trip again with current routes"
      accessibilityLabel={`${status} trip from ${origin} to ${destination}, ${completedTime.format(endedAt)}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.icon}><Icon color={colors.primary} filled={true} name="recent" size={20} /></View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.destination}>{destination}</Text>
        <Text numberOfLines={1} style={styles.origin}>{`From ${origin}`}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.status, outcome === 'ended-early' && styles.endedEarly]}>{status}</Text>
          <Text style={styles.meta}>{completedTime.format(endedAt)}</Text>
          {lines.length > 0 ? <Text numberOfLines={1} style={styles.lines}>{lines.join(' · ')}</Text> : null}
        </View>
      </View>
      <Icon color={colors.mutedInk} name="forward" size={17} />
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.blueSoft },
  copy: { flex: 1, minWidth: 0 },
  destination: { color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  origin: { marginTop: 1, color: colors.mutedInk, ...typography.metadata },
  metaRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  status: { color: colors.success, ...typography.label, letterSpacing: 0.2 },
  endedEarly: { color: colors.warning },
  meta: { color: colors.mutedInk, ...typography.metadata },
  lines: { flex: 1, color: colors.primary, ...typography.metadata },
});
