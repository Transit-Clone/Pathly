import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  recentTripById,
  routeById,
  type ItineraryId,
  type RecentTripId,
  type RouteId,
} from '../data/transit';
import { colors } from '../theme/colors';
import { CurrentLocationButton } from './CurrentLocationButton';
import { CurrentLocationMarker } from './CurrentLocationMarker';
import { MapBackdrop } from './MapBackdrop';
import { ProfileView } from './ProfileView';
import { RecentTripDetailView } from './RecentTripDetailView';
import { RouteDetailView } from './RouteDetailView';
import { RouteResultsView } from './RouteResultsView';
import { SearchHeader } from './SearchHeader';
import { SearchView } from './SearchView';
import { TransitSheet, type SheetState, type TransitTabId } from './TransitSheet';

type ActiveView =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'route'; routeId: RouteId }
  | { name: 'results'; destination: string }
  | { name: 'recentTrip'; tripId: RecentTripId }
  | { name: 'profile' };

type ActiveTrip =
  | { kind: 'planned'; itineraryId: ItineraryId }
  | { kind: 'recent'; tripId: RecentTripId }
  | null;

export function HomeScreen() {
  const [activeView, setActiveView] = useState<ActiveView>({ name: 'home' });
  const [activeTrip, setActiveTrip] = useState<ActiveTrip>(null);
  const [homeTab, setHomeTab] = useState<TransitTabId>('nearby');
  const [selectedSearchTripId, setSelectedSearchTripId] = useState<ItineraryId | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>('compact');
  const { height } = useWindowDimensions();
  const minimizedSheetHeight = 64;
  const compactSheetHeight = Math.min(460, Math.max(350, height * 0.44));
  const expandedSheetHeight = Math.min(height - 104, Math.max(610, height * 0.78));

  const showHome = useCallback(() => setActiveView({ name: 'home' }), []);
  const showSearch = useCallback(() => {
    setSelectedSearchTripId(null);
    setActiveView({ name: 'search' });
  }, []);
  const showRouteResults = useCallback((destination: string) => {
    setSelectedSearchTripId(null);
    setActiveView({ name: 'results', destination });
  }, []);
  const showRecents = useCallback(() => {
    setHomeTab('recents');
    setSheetState('compact');
    setActiveView({ name: 'home' });
  }, []);
  const showRecentTrip = useCallback((tripId: RecentTripId) => {
    setHomeTab('recents');
    setActiveView({ name: 'recentTrip', tripId });
  }, []);
  const startRecentTrip = useCallback((tripId: RecentTripId) => {
    setActiveTrip({ kind: 'recent', tripId });
    setHomeTab('recents');
    setActiveView({ name: 'recentTrip', tripId });
  }, []);
  const endRecentTrip = useCallback(() => {
    setActiveTrip(null);
    showRecents();
  }, [showRecents]);
  const showPlannedTrip = useCallback((itineraryId: ItineraryId) => {
    setSelectedSearchTripId(itineraryId);
  }, []);
  const closePlannedTrip = useCallback(() => {
    setSelectedSearchTripId(null);
  }, []);
  const startPlannedTrip = useCallback((itineraryId: ItineraryId) => {
    setActiveTrip({ kind: 'planned', itineraryId });
    setSelectedSearchTripId(itineraryId);
  }, []);
  const endPlannedTrip = useCallback(() => {
    setActiveTrip(null);
    setSelectedSearchTripId(null);
  }, []);

  const closeCurrentView = useCallback(() => {
    if (activeView.name === 'results') {
      if (selectedSearchTripId) {
        closePlannedTrip();
        return;
      }
      showSearch();
      return;
    }

    if (activeView.name === 'recentTrip') {
      showRecents();
      return;
    }

    showHome();
  }, [activeView.name, closePlannedTrip, selectedSearchTripId, showHome, showRecents, showSearch]);

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
        onSelect={(place) => showRouteResults(place.title)}
      />
    );
  }

  if (activeView.name === 'route') {
    return <RouteDetailView onBack={showHome} route={routeById[activeView.routeId]} />;
  }

  if (activeView.name === 'results') {
    return (
      <RouteResultsView
        activeItineraryId={activeTrip?.kind === 'planned' ? activeTrip.itineraryId : null}
        destination={activeView.destination}
        onBack={showSearch}
        onCloseTrip={closePlannedTrip}
        onEndTrip={endPlannedTrip}
        onOpenTrip={showPlannedTrip}
        onStartTrip={startPlannedTrip}
        selectedItineraryId={selectedSearchTripId}
      />
    );
  }

  if (activeView.name === 'recentTrip') {
    return (
      <RecentTripDetailView
        isActive={activeTrip?.kind === 'recent' && activeTrip.tripId === activeView.tripId}
        onBack={showRecents}
        onEnd={endRecentTrip}
        onStart={() => startRecentTrip(activeView.tripId)}
        trip={recentTripById[activeView.tripId]}
      />
    );
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
          activeTripId={activeTrip?.kind === 'recent' ? activeTrip.tripId : null}
          activeTab={homeTab}
          compactHeight={compactSheetHeight}
          expandedHeight={expandedSheetHeight}
          minimizedHeight={minimizedSheetHeight}
          onOpenRoute={(routeId) => setActiveView({ name: 'route', routeId })}
          onOpenTrip={showRecentTrip}
          onEndTrip={endRecentTrip}
          onStartTrip={startRecentTrip}
          onStateChange={setSheetState}
          onTabChange={setHomeTab}
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
