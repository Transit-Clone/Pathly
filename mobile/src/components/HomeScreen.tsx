import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { routeById, type RouteId } from '../data/transit';
import { colors } from '../theme/colors';
import { CurrentLocationButton } from './CurrentLocationButton';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { MapBackdrop } from './MapBackdrop';
import { ProfileView } from './ProfileView';
import { RouteDetailView } from './RouteDetailView';
import { RouteResultsView } from './RouteResultsView';
import { SearchHeader } from './SearchHeader';
import { SearchView } from './SearchView';
import { TransitSheet, type SheetState } from './TransitSheet';

type ActiveView =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'route'; routeId: RouteId }
  | { name: 'results'; destination: string }
  | { name: 'profile' };

export function HomeScreen() {
  const [activeView, setActiveView] = useState<ActiveView>({ name: 'home' });
  const [sheetState, setSheetState] = useState<SheetState>('compact');
  const { height } = useWindowDimensions();
  const minimizedSheetHeight = 64;
  const compactSheetHeight = Math.min(460, Math.max(350, height * 0.44));
  const expandedSheetHeight = Math.min(height - 104, Math.max(610, height * 0.78));

  const showHome = useCallback(() => setActiveView({ name: 'home' }), []);
  const showSearch = useCallback(() => setActiveView({ name: 'search' }), []);

  const closeCurrentView = useCallback(() => {
    setActiveView((view) => (view.name === 'results' ? { name: 'search' } : { name: 'home' }));
  }, []);

  useEffect(() => {
    if (activeView.name === 'home' || Platform.OS === 'web') {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCurrentView();
      return true;
    });
    return () => subscription.remove();
  }, [activeView.name, closeCurrentView]);

  if (activeView.name === 'search') {
    return (
      <SearchView
        onCancel={showHome}
        onSelect={(place) => setActiveView({ name: 'results', destination: place.title })}
      />
    );
  }

  if (activeView.name === 'route') {
    return <RouteDetailView onBack={showHome} route={routeById[activeView.routeId]} />;
  }

  if (activeView.name === 'results') {
    return <RouteResultsView destination={activeView.destination} onBack={showSearch} />;
  }

  if (activeView.name === 'profile') {
    return <ProfileView onBack={showHome} />;
  }

  const locationButtonBottom =
    sheetState === 'minimized' ? minimizedSheetHeight + 16 : compactSheetHeight + 16;

  return (
    <View style={styles.viewport}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <MapBackdrop />
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.header}>
            <SearchHeader
              onProfilePress={() => setActiveView({ name: 'profile' })}
              onSearchPress={showSearch}
            />
          </View>
        </SafeAreaView>

        <View style={styles.locationMarker}><CurrentLocationMarker /></View>

        {sheetState !== 'expanded' ? (
          <View style={[styles.locationButton, { bottom: locationButtonBottom }]}>
            <CurrentLocationButton />
          </View>
        ) : null}

        <TransitSheet
          compactHeight={compactSheetHeight}
          expandedHeight={expandedSheetHeight}
          minimizedHeight={minimizedSheetHeight}
          onOpenRoute={(routeId) => setActiveView({ name: 'route', routeId })}
          onOpenTrip={(destination) => setActiveView({ name: 'results', destination })}
          onStateChange={setSheetState}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  safeArea: { zIndex: 4 },
  header: { paddingTop: 10, paddingHorizontal: 16 },
  locationMarker: { position: 'absolute', top: '29%', left: '47%' },
  locationButton: { position: 'absolute', right: 16, zIndex: 2 },
});
