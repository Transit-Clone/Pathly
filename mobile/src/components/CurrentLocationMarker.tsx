import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';

export function CurrentLocationMarker() {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      accessibilityLabel="Current location"
      accessible={true}
      style={styles.pulse}
    >
      <View style={styles.dot} />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  pulse: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: colors.locationHalo,
  },
  dot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 5,
  },
});
