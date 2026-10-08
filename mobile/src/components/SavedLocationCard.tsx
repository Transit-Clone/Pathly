import { StyleSheet, Text, View } from 'react-native';

import type { SavedLocation } from '../data/userData';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type SavedLocationCardProps = {
  location: SavedLocation;
  onOpen: () => void;
  testID: string;
};

export function SavedLocationCard({ location, onOpen, testID }: SavedLocationCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { name, streetAddress } = location.address;

  return (
    <PressableScale
      accessibilityLabel={`Plan a trip to saved place ${name}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        <Icon color={colors.primary} filled={true} name="place" size={20} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>{name}</Text>
        {streetAddress ? <Text numberOfLines={1} style={styles.address}>{streetAddress}</Text> : null}
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
