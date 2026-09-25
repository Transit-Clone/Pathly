import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/colors';

export function CurrentLocationMarker() {
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

const styles = StyleSheet.create({
  pulse: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(167, 216, 255, 0.46)',
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
