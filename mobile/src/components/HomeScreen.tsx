import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyLirrLive } from '../data/applyLirrLive';
import { favoriteTripKey, type FavoriteTrip } from '../data/favorites';
import { LirrLiveProvider, useLirrLive } from '../data/LirrLiveContext';
import { nearestPortJeffersonStop, type LiveStop } from '../data/nearestStop';
import {
  DEFAULT_PINNED_ROUTE_IDS,
  recentTripById,
  routeById,
  type ItineraryId,
  type RecentTripId,
  type RouteId,
  type TripTimeChoice,
} from '../data/transit';
import { useCurrentLocation, type Coordinates } from '../hooks/useCurrentLocation';
import { ThemedStatusBar, useThemedStyles } from '../theme/AppSettings';
import { ScreenTransition } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { CurrentLocationButton } from './CurrentLocationButton';
import { GoogleMapView } from './GoogleMapView';
import { ProfileView } from './ProfileView';
import { RecentTripDetailView } from './RecentTripDetailView';
import { RouteDetailView } from './RouteDetailView';
import { RouteResultsView } from './RouteResultsView';
import { SearchHeader } from './SearchHeader';
import { SearchView } from './SearchView';
import { TransitSheet, type TransitTabId } from './TransitSheet';

const TRANSIT_TABS_HEIGHT = 44;
const TRANSIT_CARD_HEIGHT = 104;
const VISIBLE_TRANSIT_CARDS = 3;
const VISIBLE_CARD_GUTTER = 24;
const MINIMUM_MAP_HEIGHT = 240;

type ActiveView =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'route'; routeId: RouteId }
  | { name: 'results'; destination: string; returnTo: 'search' | 'favorites' }
  | { name: 'recentTrip'; tripId: RecentTripId; returnTab: TransitTabId }
  | { name: 'profile' };

type ActiveTrip =
  | { kind: 'planned'; itineraryId: ItineraryId }
  | { kind: 'recent'; tripId: RecentTripId }
  | null;

function toggleItem<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

type RouteDetailScreenProps = {
  isFavorite: boolean;
  isPinned: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  routeId: RouteId;
  liveStop: LiveStop;
  location: Coordinates;
  locationKnown: boolean;
  onRefreshLocation: () => void;
};

/** Reads live LIRR data itself — must render under LirrLiveProvider, which HomeScreen itself can't consume. */
function RouteDetailScreen({ isFavorite, isPinned, liveStop, location, locationKnown, onBack, onRefreshLocation, onToggleFavorite, onTogglePin, routeId }: RouteDetailScreenProps) {
  const lirrLive = useLirrLive();
  return (
    <RouteDetailView
      isFavorite={isFavorite}
      isPinned={isPinned}
      liveStop={liveStop}
      location={location}
      locationKnown={locationKnown}
      onBack={onBack}
      onRefreshLocation={onRefreshLocation}
      onToggleFavorite={onToggleFavorite}
      onTogglePin={onTogglePin}
      route={applyLirrLive(routeById[routeId], lirrLive)}
    />
  );
}

export function HomeScreen() {
  const styles = useThemedStyles(createStyles);
  const [activeView, setActiveView] = useState<ActiveView>({ name: 'home' });
  const [activeTrip, setActiveTrip] = useState<ActiveTrip>(null);
  const [homeTab, setHomeTab] = useState<TransitTabId>('nearby');
  const [selectedSearchTripId, setSelectedSearchTripId] = useState<ItineraryId | null>(null);
  const [tripTime, setTripTime] = useState<TripTimeChoice>({ mode: 'now' });
  const [pinnedRouteIds, setPinnedRouteIds] = useState<readonly RouteId[]>(DEFAULT_PINNED_ROUTE_IDS);
  const [favoriteRouteIds, setFavoriteRouteIds] = useState<readonly RouteId[]>([]);
  const [favoriteTrips, setFavoriteTrips] = useState<readonly FavoriteTrip[]>([]);
  const { height } = useWindowDimensions();
  const { location, known: locationKnown, refresh: refreshLocation } = useCurrentLocation();
  const [isLocationCentered, setIsLocationCentered] = useState(false);
  const mapHeight = Math.max(
    MINIMUM_MAP_HEIGHT,
    height
      - TRANSIT_TABS_HEIGHT
      - TRANSIT_CARD_HEIGHT * VISIBLE_TRANSIT_CARDS
      - VISIBLE_CARD_GUTTER,
  );
  const [homeScrollY] = useState(() => new Animated.Value(0));
  const locationButtonOpacity = homeScrollY.interpolate({
    inputRange: [0, 48],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const locationButtonTranslateY = homeScrollY.interpolate({
    inputRange: [0, mapHeight],
    outputRange: [0, -mapHeight],
    extrapolate: 'clamp',
  });

  const showHome = useCallback(() => setActiveView({ name: 'home' }), []);
  const showSearch = useCallback(() => {
    setSelectedSearchTripId(null);
    setActiveView({ name: 'search' });
  }, []);
  const showRouteResults = useCallback((destination: string) => {
    setSelectedSearchTripId(null);
    setActiveView({ name: 'results', destination, returnTo: 'search' });
  }, []);
  const showFavorites = useCallback(() => {
    setHomeTab('favorites');
    setActiveView({ name: 'home' });
  }, []);
  const isTripFavorite = useCallback(
    (trip: FavoriteTrip) => favoriteTrips.some((item) => favoriteTripKey(item) === favoriteTripKey(trip)),
    [favoriteTrips],
  );
  const toggleTripFavorite = useCallback((trip: FavoriteTrip) => {
    setFavoriteTrips((current) =>
      current.some((item) => favoriteTripKey(item) === favoriteTripKey(trip))
        ? current.filter((item) => favoriteTripKey(item) !== favoriteTripKey(trip))
        : [...current, trip],
    );
  }, []);
  const openFavoriteTrip = useCallback((trip: FavoriteTrip) => {
    if (trip.kind === 'recent') {
      setActiveView({ name: 'recentTrip', tripId: trip.tripId, returnTab: 'favorites' });
      return;
    }
    setTripTime(trip.time);
    setSelectedSearchTripId(trip.itineraryId);
    setActiveView({ name: 'results', destination: trip.destination, returnTo: 'favorites' });
  }, []);
  const showRecents = useCallback(() => {
    setHomeTab('recents');
    setActiveView({ name: 'home' });
  }, []);
  const showRecentTrip = useCallback((tripId: RecentTripId) => {
    setHomeTab('recents');
    setActiveView({ name: 'recentTrip', tripId, returnTab: 'recents' });
  }, []);
  const startRecentTrip = useCallback((tripId: RecentTripId) => {
    setActiveTrip({ kind: 'recent', tripId });
    setActiveView((current) => ({
      name: 'recentTrip',
      tripId,
      returnTab: current.name === 'recentTrip' ? current.returnTab : 'recents',
    }));
  }, []);
  const closeRecentTrip = useCallback(() => {
    const returnTab = activeView.name === 'recentTrip' ? activeView.returnTab : 'recents';
    setHomeTab(returnTab);
    setActiveView({ name: 'home' });
  }, [activeView]);
  const endRecentTrip = useCallback(() => {
    setActiveTrip(null);
    if (activeView.name === 'recentTrip') {
      closeRecentTrip();
      return;
    }
    showRecents();
  }, [activeView.name, closeRecentTrip, showRecents]);
  const showPlannedTrip = useCallback((itineraryId: ItineraryId) => {
    setSelectedSearchTripId(itineraryId);
  }, []);
  const closePlannedTrip = useCallback(() => {
    setSelectedSearchTripId(null);
    if (activeView.name === 'results' && activeView.returnTo === 'favorites') {
      showFavorites();
    }
  }, [activeView, showFavorites]);
  const closeResults = useCallback(() => {
    if (activeView.name === 'results' && activeView.returnTo === 'favorites') {
      showFavorites();
      return;
    }
    showSearch();
  }, [activeView, showFavorites, showSearch]);
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
      closeResults();
      return;
    }

    if (activeView.name === 'recentTrip') {
      closeRecentTrip();
      return;
    }

    showHome();
  }, [activeView.name, closePlannedTrip, closeRecentTrip, closeResults, selectedSearchTripId, showHome]);

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

  const transitionKey = activeView.name === 'route'
    ? `route-${activeView.routeId}`
    : activeView.name === 'recentTrip'
      ? `recent-${activeView.tripId}`
      : activeView.name;
  // Only the Port Jefferson Branch has a live feed wired up today; this is the one place that
  // decides which branch's data the rest of the screen tree sees via useLirrLive().
  const liveSource = routeById.ronkonkoma.liveSource;
  // Live departures come from the branch station nearest the rider; `location` starts as (and,
  // with permission denied, stays) the Stony Brook-area fallback, so this defaults to Stony Brook.
  const liveStop = nearestPortJeffersonStop(location);
  const screen = (node: ReactNode) => (
    <LirrLiveProvider routeId={liveSource?.routeId ?? ''} stopId={liveSource ? liveStop.stopId : ''}>
      <ScreenTransition key={transitionKey}>{node}</ScreenTransition>
    </LirrLiveProvider>
  );

  if (activeView.name === 'search') {
    return screen(
      <SearchView
        onCancel={showHome}
        onSelect={(place) => showRouteResults(place.title)}
      />
    );
  }

  if (activeView.name === 'route') {
    const { routeId } = activeView;
    return screen(
      <RouteDetailScreen
        isFavorite={favoriteRouteIds.includes(routeId)}
        isPinned={pinnedRouteIds.includes(routeId)}
        liveStop={liveStop}
        location={location}
        locationKnown={locationKnown}
        onBack={showHome}
        onRefreshLocation={() => void refreshLocation()}
        onToggleFavorite={() => setFavoriteRouteIds((current) => toggleItem(current, routeId))}
        onTogglePin={() => setPinnedRouteIds((current) => toggleItem(current, routeId))}
        routeId={routeId}
      />
    );
  }

  if (activeView.name === 'results') {
    return screen(
      <RouteResultsView
        activeItineraryId={activeTrip?.kind === 'planned' ? activeTrip.itineraryId : null}
        destination={activeView.destination}
        isTripFavorite={(itineraryId, destination) => isTripFavorite({ kind: 'planned', itineraryId, destination, time: tripTime })}
        onBack={closeResults}
        onChangeTripTime={setTripTime}
        onCloseTrip={closePlannedTrip}
        onEndTrip={endPlannedTrip}
        onOpenTrip={showPlannedTrip}
        onStartTrip={startPlannedTrip}
        onToggleTripFavorite={(itineraryId, destination) => toggleTripFavorite({ kind: 'planned', itineraryId, destination, time: tripTime })}
        selectedItineraryId={selectedSearchTripId}
        tripTime={tripTime}
      />
    );
  }

  if (activeView.name === 'recentTrip') {
    return screen(
      <RecentTripDetailView
        isActive={activeTrip?.kind === 'recent' && activeTrip.tripId === activeView.tripId}
        isFavorite={isTripFavorite({ kind: 'recent', tripId: activeView.tripId })}
        onBack={closeRecentTrip}
        onEnd={endRecentTrip}
        onStart={() => startRecentTrip(activeView.tripId)}
        onToggleFavorite={() => toggleTripFavorite({ kind: 'recent', tripId: activeView.tripId })}
        trip={recentTripById[activeView.tripId]}
      />
    );
  }

  if (activeView.name === 'profile') {
    return screen(<ProfileView onBack={showHome} />);
  }

  return screen(
    <View style={styles.viewport}>
      <ThemedStatusBar />
      <View style={styles.screen}>
        <GoogleMapView
          location={location}
          onUserPan={() => setIsLocationCentered(false)}
          padding={{ top: 80, bottom: height - mapHeight }}
        />
        <Animated.View
          style={[
            styles.locationButton,
            {
              bottom: height - mapHeight + 16,
              opacity: locationButtonOpacity,
              transform: [{ translateY: locationButtonTranslateY }],
            },
          ]}
        >
          <CurrentLocationButton
            onPress={() => {
              setIsLocationCentered(true);
              void refreshLocation();
            }}
            selected={isLocationCentered}
          />
        </Animated.View>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.header}>
            <SearchHeader
              onProfilePress={() => setActiveView({ name: 'profile' })}
              onSearchPress={showSearch}
            />
          </View>
        </SafeAreaView>

        <TransitSheet
          activeTripId={activeTrip?.kind === 'recent' ? activeTrip.tripId : null}
          activeTab={homeTab}
          favoriteRouteIds={favoriteRouteIds}
          favoriteTrips={favoriteTrips}
          mapHeight={mapHeight}
          onOpenFavoriteTrip={openFavoriteTrip}
          onOpenRoute={(routeId) => setActiveView({ name: 'route', routeId })}
          onOpenTrip={showRecentTrip}
          onEndTrip={endRecentTrip}
          onStartTrip={startRecentTrip}
          onTabChange={setHomeTab}
          pinnedRouteIds={pinnedRouteIds}
          scrollY={homeScrollY}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  safeArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 30,
  },
  header: { paddingTop: 10, paddingHorizontal: 16 },
  locationButton: {
    position: 'absolute',
    right: 16,
    zIndex: 4,
    elevation: 4,
  },
});
