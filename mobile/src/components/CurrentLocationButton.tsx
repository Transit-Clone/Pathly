import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type CurrentLocationButtonProps = {
  onPress?: () => void;
  selected?: boolean;
  testID?: string;
};

export function CurrentLocationButton({ onPress, selected, testID }: CurrentLocationButtonProps) {
  const styles = useThemedStyles(createStyles);
  const [centered, setCentered] = useState(false);
  const isSelected = selected ?? centered;

  return (
    <PressableScale
      accessibilityHint="Centers the map on your location"
      accessibilityLabel="Center on current location"
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={() => {
        setCentered(true);
        onPress?.();
      }}
      style={[styles.button, isSelected && styles.selected]}
      testID={testID}
    >
      <Icon filled={isSelected} name="locate" size={22} />
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  selected: {
    backgroundColor: colors.blueSoft,
  },
});
