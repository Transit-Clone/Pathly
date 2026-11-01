import { StyleSheet, Text, View } from 'react-native';

import { useRouteColor } from '../data/routeColors';
import { savedPlaceColor } from '../data/savedPlacePin';
import type { SavedLocation } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { FitText } from './FitText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { savedLocationIcon, savedPlaceLines } from './SavedPlacesStrip';
import { radii } from '../theme/shape';

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
      accessibilityLabel="Add a favorite"
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, styles.addCard]}
      testID="add-saved-place"
    >
      <View style={styles.iconWrap}>
        <Icon color={colors.primary} name="add" size={20} />
      </View>
      <View style={styles.text}>
        <Text style={styles.addName}>Add favorite</Text>
        <Text style={styles.addAddress}>Home, work, or anywhere you go often</Text>
      </View>
    </PressableScale>
  );
}

/** Drawn like a route card (TransitCard): filled with the place's color, its name large, its icon where a route's minutes go. */
export function SavedLocationCard({ location, onOpen, testID }: SavedLocationCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const routeColor = useRouteColor();
  const { title, subtitle } = savedPlaceLines(location);
  // White can't be read on the one light color a place can have.
  const ink = location.address.color === 'yellow' ? '#1A1A1A' : colors.white;

  return (
    <PressableScale
      accessibilityLabel={`Plan a trip to favorite ${title}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.card, { backgroundColor: routeColor(savedPlaceColor(location.address, colors.primary)) }]}
      testID={testID}
    >
      <View style={styles.text}>
        <FitText style={[styles.name, { color: ink }]}>{title}</FitText>
        {subtitle ? <Text numberOfLines={1} style={[styles.address, { color: ink }]}>{subtitle}</Text> : null}
      </View>
      <Icon color={ink} name={savedLocationIcon(location.address)} size={34} />
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 8,
    marginVertical: 3,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  addCard: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.background,
  },
  text: { minWidth: 0, flex: 1 },
  name: { ...typography.displayTime, fontSize: 24 },
  address: { marginTop: 2, ...typography.metadata, opacity: 0.84 },
  addName: { color: colors.ink, ...typography.bodyStrong, fontSize: 16 },
  addAddress: { marginTop: 1, color: colors.mutedInk, ...typography.metadata },
});
