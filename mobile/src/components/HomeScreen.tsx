import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { CurrentLocationButton } from './CurrentLocationButton';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { MapBackdrop } from './MapBackdrop';
import { RonkonkomaRouteView } from './RonkonkomaRouteView';
import { SearchHeader } from './SearchHeader';
import { SearchView } from './SearchView';
import { TransitSheet } from './TransitSheet';

type ActiveView = 'home' | 'search' | 'ronkonkoma-route';

export function HomeScreen() {
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const { height } = useWindowDimensions();
  const compactSheetHeight = Math.min(520, Math.max(400, height * 0.5));
  const expandedSheetHeight = Math.min(height - 138, Math.max(620, height * 0.78));

  const showHome = useCallback(() => setActiveView('home'), []);
  const showSearch = useCallback(() => setActiveView('search'), []);
  const showRonkonkoma = useCallback(() => setActiveView('ronkonkoma-route'), []);
  const closeCurrentView = useCallback(() => setActiveView('home'), []);

  useEffect(() => {
    if (activeView === 'home' || Platform.OS === 'web') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCurrentView();
      return true;
    });

    return () => subscription.remove();
  }, [activeView, closeCurrentView]);

  if (activeView === 'search') {
    return <SearchView onCancel={showHome} />;
  }

  if (activeView === 'ronkonkoma-route') {
    return <RonkonkomaRouteView onBack={closeCurrentView} />;
  }

  return (
    <View style={styles.viewport}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <MapBackdrop />

        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.header}>
            <SearchHeader onSearchPress={showSearch} />
          </View>
        </SafeAreaView>

        <View style={styles.locationMarker}>
          <CurrentLocationMarker />
        </View>

        <View style={[styles.locationButton, { bottom: compactSheetHeight + 16 }]}>
          <CurrentLocationButton />
        </View>

        <TransitSheet
          compactHeight={compactSheetHeight}
          expandedHeight={expandedSheetHeight}
          onOpenRonkonkoma={showRonkonkoma}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  screen: {
    width: '100%',
    maxWidth: 540,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  safeArea: {
    zIndex: 4,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  locationMarker: {
    position: 'absolute',
    top: '31%',
    left: '47%',
  },
  locationButton: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
  },
});
