import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, BackHandler, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyRouteLive } from '../data/applyRouteLive';
import { favoriteTripKey, type FavoriteTrip } from '../data/favorites';
import { discoveredRouteToRouteDetail, fetchNearbyTransit, filterOutPinnedDuplicates } from '../data/nearbyTransit';
import { TransitLiveProvider, useTransitLive } from '../data/TransitLiveContext';
import {
  recentTripById,
  routes,
  type ItineraryId,
  type RecentTripId,
  type RouteDetail,
  type TripTimeChoice,
} from '../data/transit';
import { useCurrentLocation, type Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
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
// Height reserved for the floating search header at the top of the map.
const HEADER_INSET = 80;
const SEARCH_CENTER_SIZE = 28;
const NEARBY_SEARCH_DEBOUNCE_MS = 600;

type ActiveView =
  | { name: 'home' }
  | { name: 'search' }
  // `route` is the snapshot opened, so the page never depends on the route still being nearby.
  | { name: 'route'; routeId: string; route: RouteDetail }
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
  onBack: () => void;
  onToggleFavorite: () => void;
  route: RouteDetail;
  location: Coordinates;
  locationKnown: boolean;
  onRefreshLocation: () => void;
};

/** Reads live transit data itself — must render under TransitLiveProvider, which HomeScreen itself can't consume. */
function RouteDetailScreen({ isFavorite, location, locationKnown, onBack, onRefreshLocation, onToggleFavorite, route }: RouteDetailScreenProps) {
  const live = useTransitLive(route.id);
  // Re-applies live data every 30 s so countdowns age and past departures drop between polls.
  const now = useNow(30_000);
  return (
    <RouteDetailView
      isFavorite={isFavorite}
      location={location}
      locationKnown={locationKnown}
      onBack={onBack}
      onRefreshLocation={onRefreshLocation}
      onToggleFavorite={onToggleFavorite}
      route={applyRouteLive(route, live, now)}
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
  // One "Save" star replaces pin + favorite: saved routes lead Nearby and fill Favorites -> Routes.
  // Nothing is saved by default.
  const [savedRouteIds, setSavedRouteIds] = useState<readonly string[]>([]);
  const [favoriteTrips, setFavoriteTrips] = useState<readonly FavoriteTrip[]>([]);
  const { height } = useWindowDimensions();
  const { location, refresh: refreshLocation, status: locationStatus } = useCurrentLocation();
  const [isLocationCentered, setIsLocationCentered] = useState(false);

  // Every real nearby route, across every configured agency — not a fixed handful of
  // hand-picked lines (nearbyTransit.ts). Fetched only on real location changes (the watch in
  // useCurrentLocation already throttles how often that is) — deliberately *not* on pin/unpin,
  // since re-fetching from the network would briefly empty this list while reloading, and a
  // route whose own detail page is open (e.g. because the rider just pinned it from there)
  // would disappear from `findRoute` lookups during that gap and bounce them back to Home.
  // Pin state only affects the separate, pure `nearbyRoutes` filter below.
  // Once loaded, a re-fetch keeps showing the previous list (`refreshing`) instead of emptying
  // it: location updates arrive every few seconds, and an empty gap made the open route page
  // lose its route and bounce back to Home.
  const [nearbyStatus, setNearbyStatus] = useState<{ status: 'loading' } | { status: 'loaded'; routes: readonly RouteDetail[]; refreshing?: boolean } | { status: 'error' }>({ status: 'loading' });
  // Where the rider has panned the home map to explore (null = their own location). Nearby is
  // searched around this point; live predictions still use the rider's real location.
  const [searchCenter, setSearchCenter] = useState<Coordinates | null>(null);
  const nearbyPoint = searchCenter ?? location;
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setNearbyStatus((current) => (current.status === 'loaded' ? { ...current, refreshing: true } : { status: 'loading' }));
      try {
        const discovered = await fetchNearbyTransit(nearbyPoint);
        if (cancelled) return;
        setNearbyStatus({ status: 'loaded', routes: discovered.map(discoveredRouteToRouteDetail) });
      } catch {
        if (!cancelled) setNearbyStatus((current) => (current.status === 'loaded' ? { ...current, refreshing: false } : { status: 'error' }));
      }
    };
    // Debounced so a burst of map gestures or GPS updates triggers one search.
    const timer = setTimeout(load, NEARBY_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the coordinate primitives, not the point object (a new reference every GPS update)
  }, [nearbyPoint.latitude, nearbyPoint.longitude]);
  // Every discovered route, regardless of pin state — used for resolving ids (findRoute) so a
  // pinned route's own detail page keeps working.
  const allDiscoveredRoutes = useMemo(
    () => (nearbyStatus.status === 'loaded' ? nearbyStatus.routes : []),
    [nearbyStatus],
  );
  // What actually shows in the Nearby section: the same discovered routes, minus any that are
  // the exact same real line as one that's currently pinned (so it isn't shown twice) — a
  // pure filter over `allDiscoveredRoutes`, re-evaluated on save/unsave without a network call.
  const nearbyRoutes = useMemo(() => {
    const savedRoutes = savedRouteIds.map((id) => routes.find((route) => route.id === id)).filter((route): route is RouteDetail => route != null);
    return filterOutPinnedDuplicates(allDiscoveredRoutes, savedRoutes);
  }, [allDiscoveredRoutes, savedRouteIds]);

  // Resolves either kind of id a card/pin/favorite can hold: the demo catalog's own (routeById)
  // or a dynamically-discovered one — so opening, pinning, or favoriting works the same way
  // regardless of where a route came from. Deliberately searches `allDiscoveredRoutes`, not
  // the pin-filtered `nearbyRoutes` — a just-pinned route must stay resolvable by id even
  // though it's no longer shown in the Nearby section itself.
  const findRoute = useCallback(
    (routeId: string): RouteDetail | undefined => routes.find((route) => route.id === routeId) ?? allDiscoveredRoutes.find((route) => route.id === routeId),
    [allDiscoveredRoutes],
  );

  const openRoute = useCallback((routeId: string) => {
    const route = findRoute(routeId);
    if (route) setActiveView({ name: 'route', routeId, route });
  }, [findRoute]);

  const mapHeight = Math.max(
    MINIMUM_MAP_HEIGHT,
    height
      - TRANSIT_TABS_HEIGHT
      - TRANSIT_CARD_HEIGHT * VISIBLE_TRANSIT_CARDS
      - VISIBLE_CARD_GUTTER,
  );
  // The transit menu scrolls over the map in one page scroll; the location button fades out and
  // rides up with it.
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
  // The open route keeps receiving live data even after it drops out of the nearby list.
  const openedRoute = activeView.name === 'route' ? activeView.route : null;
  const liveRoutes = openedRoute && !allDiscoveredRoutes.some((route) => route.id === openedRoute.id)
    ? [...allDiscoveredRoutes, openedRoute]
    : allDiscoveredRoutes;
  const screen = (node: ReactNode) => (
    <TransitLiveProvider extraRoutes={liveRoutes} location={location}>
      <ScreenTransition key={transitionKey}>{node}</ScreenTransition>
    </TransitLiveProvider>
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
    // Prefer the freshest copy, but keep the opened snapshot if the route has since dropped out
    // of the nearby list (the rider moved), so the page stays open.
    const route = findRoute(routeId) ?? activeView.route;
    return screen(
      <RouteDetailScreen
        isFavorite={savedRouteIds.includes(routeId)}
        onBack={showHome}
        location={location}
        locationKnown={locationStatus === 'located'}
        onRefreshLocation={() => void refreshLocation()}
        onToggleFavorite={() => setSavedRouteIds((current) => toggleItem(current, routeId))}
        route={route}
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
          onUserMoveEnd={setSearchCenter}
          onUserPan={() => setIsLocationCentered(false)}
          padding={{ top: HEADER_INSET, bottom: height - mapHeight }}
        />
        {searchCenter ? (
          // Fixed at the center of the visible map (below the header, above the resting sheet):
          // the point Nearby is currently searching around.
          <View
            accessibilityLabel="Searching nearby transit around the map center"
            pointerEvents="none"
            style={[styles.searchCenter, { top: (HEADER_INSET + mapHeight) / 2 - SEARCH_CENTER_SIZE / 2 }]}
            testID="search-center"
          />
        ) : null}
        {locationStatus !== 'located' ? (
          <View pointerEvents="none" style={[styles.locationStatusPill, { top: 80 }]}>
            <View style={styles.locationStatusBadge}>
              {locationStatus === 'loading' ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={styles.locationStatusText}>
                {locationStatus === 'loading' ? 'Finding your location…' : 'Location unavailable — showing Stony Brook'}
              </Text>
            </View>
          </View>
        ) : null}
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
            loading={locationStatus === 'loading'}
            onPress={() => {
              setIsLocationCentered(true);
              setSearchCenter(null);
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
          favoriteTrips={favoriteTrips}
          findRoute={findRoute}
          mapHeight={mapHeight}
          nearbyRoutes={nearbyRoutes}
          nearbyRefreshing={nearbyStatus.status === 'loaded' && nearbyStatus.refreshing === true}
          nearbyStatus={nearbyStatus.status}
          onOpenFavoriteTrip={openFavoriteTrip}
          onOpenRoute={openRoute}
          onOpenTrip={showRecentTrip}
          onEndTrip={endRecentTrip}
          onStartTrip={startRecentTrip}
          onTabChange={setHomeTab}
          savedRouteIds={savedRouteIds}
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
  searchCenter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
    width: SEARCH_CENTER_SIZE,
    height: SEARCH_CENTER_SIZE,
    borderWidth: 3,
    borderRadius: SEARCH_CENTER_SIZE / 2,
    borderColor: colors.searchCenter,
    backgroundColor: `${colors.searchCenter}33`,
  },
  locationStatusPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  locationStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    maxWidth: '100%',
  },
  locationStatusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
