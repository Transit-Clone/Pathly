import { StyleSheet, Text, View } from 'react-native';

import type { SavedLocation } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { savedLocationIcon, savedPlaceLines } from './SavedPlacesStrip';

type SavedLocationCardProps = {
  location: SavedLocation;
  onOpen: () => void;
  testID: string;
};

type AddSavedPlaceCardProps = { onPress: () => void };

/** The Places list's last row: starts saving a new place. */
export function AddSavedPlaceCard({ onPress }: AddSavedPlaceCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityHint="Searches for a place to save"
      accessibilityLabel="Add a saved place"
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, styles.addCard]}
      testID="add-saved-place"
    >
      <View style={styles.iconWrap}>
        <Icon color={colors.primary} name="add" size={20} />
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>Add place</Text>
        <Text style={styles.address}>Home, work, or anywhere you go often</Text>
      </View>
    </PressableScale>
  );
}

export function SavedLocationCard({ location, onOpen, testID }: SavedLocationCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { title, subtitle } = savedPlaceLines(location);

  return (
    <PressableScale
      accessibilityLabel={`Plan a trip to saved place ${title}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <Icon color={colors.primary} filled={true} name={savedLocationIcon(location.address)} size={20} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.address}>{subtitle}</Text> : null}
      </View>
      <Icon color={colors.mutedInk} name="forward" size={16} />
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  addCard: { borderStyle: 'dashed', shadowOpacity: 0, elevation: 0 },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.background,
  },
  text: { flex: 1 },
  name: { color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  address: { marginTop: 1, color: colors.mutedInk, ...typography.metadata },
});
