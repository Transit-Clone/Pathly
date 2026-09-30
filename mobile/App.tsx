import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { useFonts } from '@expo-google-fonts/nunito/useFonts';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/components/HomeScreen';
import { AppSettingsProvider } from './src/theme/AppSettings';
import { colors } from './src/theme/colors';

const pathlyLogo = require('./assets/pathly-logo.png');

export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  if (!fontsLoaded) {
    return (
      <View
        accessibilityLabel="Pathly is loading"
        accessibilityRole="progressbar"
        style={styles.loadingScreen}
        testID="loading-screen"
      >
        <Image
          accessibilityIgnoresInvertColors={true}
          resizeMode="contain"
          source={pathlyLogo}
          style={styles.loadingLogo}
          testID="loading-logo"
        />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <HomeScreen />
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingLogo: {
    width: '58%',
    maxWidth: 260,
    aspectRatio: 1,
  },
});
