import { useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { Icon } from './Icon';
import { MAP_CONTROL_SIZE } from './MapControlButton';
import { PressableScale } from './PressableScale';

type CurrentLocationButtonProps = {
  /** True while the user's real location is still being looked up — shows a spinner instead of the locate icon. */
  loading?: boolean;
  onPress?: () => void;
  selected?: boolean;
  testID?: string;
};

export function CurrentLocationButton({ loading = false, onPress, selected, testID }: CurrentLocationButtonProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [centered, setCentered] = useState(false);
  const isSelected = selected ?? centered;

  return (
    <PressableScale
      accessibilityHint="Centers the map on your location"
      accessibilityLabel={loading ? 'Finding your location' : 'Center on current location'}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => {
        setCentered(true);
        onPress?.();
      }}
      style={[styles.button, isSelected && styles.selected]}
      testID={testID}
    >
      {loading ? <ActivityIndicator color={colors.primary} size="small" /> : <Icon filled={isSelected} name="locate" size={22} />}
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  // MapControlButton's size and shadow, so every map's Locate looks the same.
  button: {
    width: MAP_CONTROL_SIZE,
    height: MAP_CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: MAP_CONTROL_SIZE / 2,
    backgroundColor: colors.mapControl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  selected: {
    backgroundColor: colors.blueSoft,
  },
});
