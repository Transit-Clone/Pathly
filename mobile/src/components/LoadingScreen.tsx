import { Image, StyleSheet, useColorScheme, View } from 'react-native';

import { colors, darkColors } from '../theme/colors';

const pathlyMark = require('../../assets/pathly-mark.png');

/** The logo alone on the device's light or dark background (saved settings aren't read yet). */
export function LoadingScreen() {
  const dark = useColorScheme() === 'dark';
  return (
    <View
      accessibilityLabel="Pathly is loading"
      accessibilityRole="progressbar"
      style={[styles.loadingScreen, { backgroundColor: dark ? darkColors.background : colors.background }]}
      testID="loading-screen"
    >
      <Image
        accessibilityIgnoresInvertColors={true}
        resizeMode="contain"
        source={pathlyMark}
        style={styles.loadingLogo}
        testID="loading-logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: '34%',
    maxWidth: 150,
    aspectRatio: 1,
  },
});
