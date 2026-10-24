import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type RecentTripCardProps = {
  destination: string;
  endedAt: number;
  onOpen: () => void;
  origin: string;
  testID: string;
};

const completedTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * A provider-light completed trip; opening it always requests a fresh route. Just where and when:
 * how the trip ended, and its lines ("LIRR · LIRR"), told riders nothing they'd act on.
 */
export function RecentTripCard({ destination, endedAt, onOpen, origin, testID }: RecentTripCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityHint="Plans this trip again with current routes"
      accessibilityLabel={`Trip from ${origin} to ${destination}, ${completedTime.format(endedAt)}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.icon}><Icon color={colors.primary} filled={true} name="recent" size={20} /></View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.destination}>{destination}</Text>
        <Text numberOfLines={1} style={styles.origin}>{`From ${origin}`}</Text>
        <Text style={styles.meta}>{completedTime.format(endedAt)}</Text>
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
  meta: { marginTop: 5, color: colors.mutedInk, ...typography.metadata },
});
