import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { useFonts } from '@expo-google-fonts/nunito/useFonts';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { needsEmailConfirmation } from './src/auth/authService';
import { AuthScreen } from './src/components/AuthScreen';
import { HomeScreen } from './src/components/HomeScreen';
import { VerifyEmailScreen } from './src/components/VerifyEmailScreen';
import { UserPreferencesProvider } from './src/data/userPreferences';
import { DebugProvider } from './src/debug/DebugContext';
import { AppSettingsProvider } from './src/theme/AppSettings';
import { colors, darkColors } from './src/theme/colors';

const pathlyMark = require('./assets/pathly-mark.png');

/** The logo alone on the device's light or dark background (saved settings aren't read yet). */
function LoadingScreen() {
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

function AppContent() {
  const { initializing, user } = useAuth();
  if (initializing) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  return needsEmailConfirmation(user) ? <VerifyEmailScreen /> : <HomeScreen />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  if (!fontsLoaded) return <LoadingScreen />;

  return (
    <SafeAreaProvider>
      <AppSettingsProvider>
        <AuthProvider>
          <UserPreferencesProvider>
            <DebugProvider>
              <AppContent />
            </DebugProvider>
          </UserPreferencesProvider>
        </AuthProvider>
      </AppSettingsProvider>
    </SafeAreaProvider>
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
