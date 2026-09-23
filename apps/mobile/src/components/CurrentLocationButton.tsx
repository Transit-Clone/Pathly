import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme/colors';

export function CurrentLocationButton() {
  return (
    <Pressable
      accessibilityHint="Centers the map on your location"
      accessibilityLabel="Center on current location"
      accessibilityRole="button"
      onPress={() => undefined}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View style={styles.compassNeedle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  compassNeedle: {
    width: 18,
    height: 18,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.blue,
    transform: [{ rotate: '36deg' }, { scale: 0.8 }],
  },
});
